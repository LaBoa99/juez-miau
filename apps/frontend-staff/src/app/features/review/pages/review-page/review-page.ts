import { TooltipDirective } from '../../../../shared/ui/tooltip.directive';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import {
  IProblemDetail,
  IProblemListItem,
  IStaffSubmission,
  IStaffSubmissionDetail,
  ISubmissionCase,
  ISubmissionCaseDetail,
  SubmissionStatus,
  Verdict,
} from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { CodeBlock } from '../../../../shared/ui/code-block.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProblemsService } from '../../../problems/data/problems.service';
import { TeamsService } from '../../../teams/data/teams.service';
import { EditionLanguagesService } from '../../../editions/edition-languages/data/edition-languages.service';
import { SubmissionsService } from '../../../submissions/data/submissions.service';
import { CaseLimits, caseReason, firstDiffLine } from '../../../submissions/utils/case-reason';

// A revisión llegan los AC de un testset con revisión manual y los envíos que un juez manda a mano.
// El veredicto final solo puede confirmar (AC) o rechazar (WA): el backend
// (`POST /submissions/:id/review`) únicamente acepta `{ accept, comment }`.
@Component({
  selector: 'oj-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipDirective,
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    ButtonDirective,
    Badge,
    Alert,
    EmptyState,
    FormField,
    Modal,
    CodeBlock,
  ],
  templateUrl: './review-page.html',
  styleUrl: './review-page.css',
})
export class ReviewPage {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SubmissionsService);
  private readonly problemsService = inject(ProblemsService);
  private readonly teamsService = inject(TeamsService);
  private readonly languagesService = inject(EditionLanguagesService);
  private readonly rt = inject(RealtimeService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = findEditionId(this.route);
  protected readonly Verdict = Verdict;

  protected readonly queue = signal<IStaffSubmission[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  // ?envio=N abre ese envío; si ya no está pendiente se avisa para no decidir sobre otro por error
  private readonly requestedId = toSignal(
    this.route.queryParamMap.pipe(map((q) => Number(q.get('envio')) || null)),
    { initialValue: null },
  );
  protected readonly missingId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  // Nombres/letras que el envío no trae.
  private readonly problemMap = signal<Map<number, IProblemListItem>>(new Map());
  private readonly teamMap = signal<Map<number, string>>(new Map());
  private readonly langMap = signal<Map<string, string>>(new Map());

  protected readonly selected = computed(
    () => this.queue().find((s) => s.id === this.selectedId()) ?? null,
  );

  // Instrucciones y límites de la versión con que se juzgó el envío
  private readonly testsetsById = signal<Map<number, IProblemDetail['testsets'][number]>>(new Map());
  private readonly loadedProblems = new Set<number>();
  protected readonly instructions = computed(() => {
    const s = this.selected();
    return s ? (this.testsetsById().get(s.testsetId)?.reviewInstructions ?? null) : null;
  });
  private readonly limits = computed<CaseLimits | null>(() => {
    const t = this.testsetsById().get(this.selected()?.testsetId ?? -1);
    return t ? { timeLimitMs: t.timeLimitMs, memoryLimitMb: t.memoryLimitMb } : null;
  });

  // Código y casos del envío elegido
  protected readonly detail = signal<IStaffSubmissionDetail | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal(false);
  protected readonly reason = computed(() => {
    const cases = this.detail()?.cases ?? [];
    const failed = cases.filter((c) => c.verdict !== Verdict.AC).length;
    if (!cases.length) return 'Un juez lo mandó a revisión. No tiene casos ejecutados.';
    return failed
      ? `Un juez lo mandó a revisión. Falló ${failed} de ${cases.length} casos.`
      : `Pasó los ${cases.length} casos. Falta la decisión de un juez.`;
  });

  // Caso abierto: se muestra junto al código, sin otra pantalla
  protected readonly openOrdinal = signal<number | null>(null);
  protected readonly openCase = computed(
    () => this.detail()?.cases.find((c) => c.ordinal === this.openOrdinal()) ?? null,
  );
  protected readonly caseData = signal<ISubmissionCaseDetail | null>(null);
  protected readonly caseLoading = signal(false);
  protected readonly caseError = signal<string | null>(null);
  protected readonly diffLine = computed(() => {
    const d = this.caseData();
    return d?.expected != null && d.actual != null && this.openCase()?.verdict !== Verdict.AC
      ? firstDiffLine(d.expected, d.actual)
      : null;
  });
  private readonly caseRequest = computed<{ id: number; ordinal: number } | null>(
    () => {
      const id = this.detail()?.id;
      const ordinal = this.openOrdinal();
      return id != null && ordinal != null ? { id, ordinal } : null;
    },
    { equal: (a, b) => a?.id === b?.id && a?.ordinal === b?.ordinal },
  );

  // Decisión del juez. Guarda el id: si otro juez resuelve el envío, la selección avanza pero la modal no cambia de envío
  private readonly decisionModal = viewChild.required<Modal>('decisionModal');
  protected readonly decision = signal<{ id: number; accept: boolean } | null>(null);
  protected readonly decisionError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly noteCtrl = this.fb.nonNullable.control('', [Validators.maxLength(1000)]);

  constructor() {
    this.loadLookups();
    this.load();

    effect(() => {
      const problemId = this.selected()?.problemId;
      if (problemId != null) untracked(() => this.loadInstructions(problemId));
    });

    toObservable(this.selectedId)
      .pipe(
        tap((id) => {
          this.detail.set(null);
          this.openOrdinal.set(null);
          this.detailError.set(false);
          this.detailLoading.set(id !== null);
        }),
        switchMap((id) =>
          id === null
            ? of(null)
            : this.service.getForStaff(id).pipe(
                catchError(() => {
                  this.detailError.set(true);
                  return of(null);
                }),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((d) => {
        this.detailLoading.set(false);
        this.detail.set(d);
        // Abre el primer caso con error; si todos pasaron, el primero
        this.openOrdinal.set((d?.cases.find((c) => c.verdict !== Verdict.AC) ?? d?.cases[0])?.ordinal ?? null);
      });

    toObservable(this.caseRequest)
      .pipe(
        tap((request) => {
          this.caseData.set(null);
          this.caseError.set(null);
          this.caseLoading.set(request !== null);
        }),
        switchMap((request) =>
          request === null
            ? of(null)
            : this.service.caseDetail(request.id, request.ordinal).pipe(
                catchError((err) => {
                  this.caseError.set(backendMessage(err, 'No se pudo cargar el detalle del caso.'));
                  return of(null);
                }),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((d) => {
        this.caseLoading.set(false);
        this.caseData.set(d);
      });

    this.rt.joinEdition(this.editionId);
    this.rt.onSubmission().pipe(takeUntilDestroyed()).subscribe((s) => this.applyUpdate(s as IStaffSubmission));
    this.destroyRef.onDestroy(() => this.rt.leave(this.editionId));
  }

  private loadInstructions(problemId: number): void {
    if (this.loadedProblems.has(problemId)) return;
    this.loadedProblems.add(problemId);
    this.problemsService.get(problemId).subscribe({
      next: (d) => {
        const next = new Map(this.testsetsById());
        for (const t of d.testsets) next.set(t.id, t);
        this.testsetsById.set(next);
      },
      // Sin instrucciones se revisa igual; se reintenta al volver a elegir el envío
      error: () => this.loadedProblems.delete(problemId),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.reviewQueue(this.editionId).subscribe({
      next: (rows) => {
        const wanted = this.requestedId();
        const found = rows.some((r) => r.id === wanted);
        this.queue.set(rows);
        this.selectedId.set(found ? wanted : (rows[0]?.id ?? null));
        this.missingId.set(wanted !== null && !found ? wanted : null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  // Recarga sin pantalla de "Cargando…" para no ocultar el aviso de error
  private reload(): void {
    this.service.reviewQueue(this.editionId).subscribe({
      next: (rows) => {
        this.queue.set(rows);
        if (!rows.some((r) => r.id === this.selectedId())) this.selectedId.set(rows[0]?.id ?? null);
      },
      error: () => {},
    });
  }

  private loadLookups(): void {
    this.problemsService.list(this.editionId).subscribe({
      next: (ps) => this.problemMap.set(new Map(ps.map((p) => [p.id, p]))),
      error: () => {},
    });
    this.teamsService.listAll(this.editionId).subscribe({
      next: (teams) => this.teamMap.set(new Map(teams.map((t) => [t.id, t.name]))),
      error: () => {},
    });
    this.languagesService.catalog().subscribe({
      next: (langs) => this.langMap.set(new Map(langs.map((l) => [l.id, l.code]))),
      error: () => {},
    });
  }

  // Un envío entra a la cola si queda PENDING_REVIEW; sale cuando cambia a cualquier otro veredicto
  // (lo resolvió este juez u otro). La selección avanza al siguiente al salir el seleccionado.
  private applyUpdate(s: IStaffSubmission): void {
    const pending = s.status === SubmissionStatus.DONE && s.verdict === Verdict.PENDING_REVIEW;
    if (pending) this.upsert(s);
    else this.removeAndAdvance(s.id);
  }

  private upsert(s: IStaffSubmission): void {
    const list = this.queue();
    const idx = list.findIndex((x) => x.id === s.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = s;
      this.queue.set(next);
    } else {
      this.queue.set([...list, s].sort((a, b) => a.id - b.id));
      if (this.selectedId() === null) this.selectedId.set(s.id);
    }
  }

  private removeAndAdvance(id: number): void {
    const list = this.queue();
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const next = list.filter((x) => x.id !== id);
    this.queue.set(next);
    if (this.selectedId() === id) {
      this.selectedId.set((next[idx] ?? next[idx - 1] ?? next[0])?.id ?? null);
    }
  }

  select(id: number): void {
    this.missingId.set(null);
    this.selectedId.set(id);
  }

  openDecision(accept: boolean): void {
    const s = this.selected();
    if (!s) return;
    // Cancelar y volver a abrir el mismo envío conserva el comentario
    if (this.decision()?.id !== s.id) this.noteCtrl.reset('');
    this.decisionError.set(null);
    this.decision.set({ id: s.id, accept });
    this.decisionModal().open();
  }

  closeDecision(): void {
    this.decisionModal().close();
  }

  confirmDecision(): void {
    const d = this.decision();
    if (!d || this.saving()) return;
    if (this.noteCtrl.invalid) {
      this.noteCtrl.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.decisionError.set(null);
    const note = this.noteCtrl.value.trim();
    this.service.review(d.id, { accept: d.accept, comment: note || undefined }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.decisionModal().close();
        this.decision.set(null);
        this.noteCtrl.reset('');
        this.removeAndAdvance(updated.id); // sale de la lista y se selecciona el siguiente
      },
      error: (err) => {
        this.saving.set(false);
        this.decisionError.set(backendMessage(err, 'No se pudo registrar el veredicto.'));
        // 409: otro juez (o un rejudge) ya lo sacó de revisión; se vuelve a pedir la cola
        if (err?.status === 409) this.reload();
      },
    });
  }

  // ─── Datos de la fila/panel ───
  minute(contestMs: number): number {
    return Math.max(0, Math.floor(contestMs / 60000));
  }
  teamName(id: number): string {
    return this.teamMap().get(id) ?? '#' + id;
  }
  letter(problemId: number): string {
    return this.problemMap().get(problemId)?.letter ?? '#' + problemId;
  }
  title(problemId: number): string {
    return this.problemMap().get(problemId)?.title ?? '';
  }
  languageCode(id: string): string {
    return this.langMap().get(id) ?? id.slice(0, 6);
  }
  maxTime(s: IStaffSubmission): string {
    return s.maxTimeMs != null ? s.maxTimeMs + ' ms' : '—';
  }
  caseProblem(c: ISubmissionCase) {
    return caseReason(c, this.limits());
  }
  lines(text: string): string[] {
    return text.split('\n');
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
