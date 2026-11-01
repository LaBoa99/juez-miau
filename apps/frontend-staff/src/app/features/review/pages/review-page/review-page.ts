import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IProblemListItem,
  IStaffSubmission,
  SubmissionStatus,
  Verdict,
} from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProblemsService } from '../../../problems/data/problems.service';
import { TeamsService } from '../../../teams/data/teams.service';
import { EditionLanguagesService } from '../../../editions/edition-languages/data/edition-languages.service';
import { SubmissionsService } from '../../../submissions/data/submissions.service';

// El juez automático solo manda a revisión los envíos que habría aceptado (AC) cuando el testset
// exige revisión manual (submission.processor: AC && manual_review → PENDING_REVIEW). Por eso el
// motivo es único y el veredicto final solo puede confirmar (AC) o rechazar (WA): el backend
// (`POST /submissions/:id/review`) únicamente acepta `{ accept, comment }`.
const REVIEW_REASON =
  'El problema está configurado para revisión manual. El juez automático ejecutó el envío y lo ' +
  'habría aceptado, pero la decisión final la toma un juez.';

const VERDICT_OPTIONS = [
  { value: 'AC', label: 'AC · Aceptado' },
  { value: 'WA', label: 'WA · Rechazado (cuenta como intento)' },
];

@Component({
  selector: 'oj-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    ButtonDirective,
    Badge,
    Alert,
    EmptyState,
    FormField,
    ConfirmDialog,
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
  protected readonly reason = REVIEW_REASON;
  protected readonly verdictOptions = VERDICT_OPTIONS;

  protected readonly queue = signal<IStaffSubmission[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly saving = signal(false);

  // Nombres/letras que el envío no trae.
  private readonly problemMap = signal<Map<number, IProblemListItem>>(new Map());
  private readonly teamMap = signal<Map<number, string>>(new Map());
  private readonly langMap = signal<Map<string, string>>(new Map());

  protected readonly selected = computed(
    () => this.queue().find((s) => s.id === this.selectedId()) ?? null,
  );

  private readonly confirmDialog = viewChild.required(ConfirmDialog);
  protected readonly verdictCtrl = this.fb.nonNullable.control('AC');
  protected readonly noteCtrl = this.fb.nonNullable.control('', [Validators.maxLength(1000)]);
  protected readonly confirmMessage = computed(() => {
    const label = VERDICT_OPTIONS.find((o) => o.value === this.verdictCtrl.value)?.label ?? '';
    const s = this.selected();
    return `Vas a registrar el veredicto ${label} para el envío #${s?.id ?? ''}. Queda en la bitácora.`;
  });

  constructor() {
    this.loadLookups();
    this.load();

    this.rt.joinEdition(this.editionId);
    this.rt.onSubmission().pipe(takeUntilDestroyed()).subscribe((s) => this.applyUpdate(s as IStaffSubmission));
    this.destroyRef.onDestroy(() => this.rt.leave(this.editionId));
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.reviewQueue(this.editionId).subscribe({
      next: (rows) => {
        this.queue.set(rows);
        this.selectedId.set(rows[0]?.id ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadLookups(): void {
    this.problemsService.list(this.editionId).subscribe({
      next: (ps) => this.problemMap.set(new Map(ps.map((p) => [p.id, p]))),
      error: () => {},
    });
    // Una página de equipos (igual que la lista de envíos); si hay más, el id cae a "#id".
    this.teamsService.list(this.editionId, { page: 1, pageSize: 100 }).subscribe({
      next: (res) => this.teamMap.set(new Map(res.items.map((t) => [t.id, t.name]))),
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
    this.selectedId.set(id);
    this.verdictCtrl.setValue('AC');
    this.noteCtrl.reset('');
    this.actionError.set(null);
  }

  openConfirm(): void {
    if (this.noteCtrl.invalid) {
      this.noteCtrl.markAsTouched();
      return;
    }
    this.actionError.set(null);
    this.confirmDialog().open();
  }

  confirmVerdict(): void {
    const s = this.selected();
    if (!s) return;
    this.saving.set(true);
    this.actionError.set(null);
    const note = this.noteCtrl.value.trim();
    this.service
      .review(s.id, { accept: this.verdictCtrl.value === 'AC', comment: note || undefined })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.removeAndAdvance(updated.id); // sale de la lista y se selecciona el siguiente
          this.verdictCtrl.setValue('AC');
          this.noteCtrl.reset('');
        },
        error: (err) => {
          this.saving.set(false);
          this.actionError.set(backendMessage(err, 'No se pudo registrar el veredicto.'));
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
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
