import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
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
import { Segmented } from '../../../../shared/ui/segmented.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { VerdictPipe } from '../../../../shared/pipes/verdict.pipe';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProblemsService } from '../../../problems/data/problems.service';
import { TeamsService } from '../../../teams/data/teams.service';
import { EditionLanguagesService } from '../../../editions/edition-languages/data/edition-languages.service';
import { SubmissionsService } from '../../data/submissions.service';

const PAGE_LIMIT = 50;
type VerdictSeg = 'all' | 'ac' | 'bad' | 'limit' | 'pending';

@Component({
  selector: 'oj-submission-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    ButtonDirective,
    Badge,
    Alert,
    EmptyState,
    Segmented,
    FormField,
    VerdictPipe,
  ],
  templateUrl: './submission-list.html',
  styleUrl: './submission-list.css',
})
export class SubmissionList {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SubmissionsService);
  private readonly problemsService = inject(ProblemsService);
  private readonly teamsService = inject(TeamsService);
  private readonly languagesService = inject(EditionLanguagesService);
  protected readonly ctx = inject(EditionContext);
  protected readonly rt = inject(RealtimeService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = findEditionId(this.route);

  protected readonly SubmissionStatus = SubmissionStatus;

  // Lista maestra (más reciente primero); la vista se filtra en el cliente.
  protected readonly all = signal<IStaffSubmission[]>([]);
  protected readonly progress = signal<Record<number, { judged: number; total: number }>>({});
  protected readonly newIds = signal<ReadonlySet<number>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly csvBusy = signal(false);

  // Búsquedas auxiliares (nombres/letras que el envío del backend no trae).
  private readonly problemMap = signal<Map<number, IProblemListItem>>(new Map());
  private readonly teamMap = signal<Map<number, { name: string; category: string }>>(new Map());
  private readonly langMap = signal<Map<string, string>>(new Map());

  protected readonly categories = computed(() => this.ctx.edition()?.categories ?? []);
  protected readonly problems = computed(() => [...this.problemMap().values()].sort((a, b) => a.letter.localeCompare(b.letter)));

  protected readonly categoryCtrl = this.fb.control<number | null>(null);
  protected readonly problemCtrl = this.fb.control<number | null>(null);
  protected readonly teamCtrl = this.fb.nonNullable.control('');
  protected readonly verdictSeg = signal<VerdictSeg>('all');
  protected readonly verdictOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'ac', label: 'AC' },
    { value: 'bad', label: 'WA · CE · RE' },
    { value: 'limit', label: 'TLE · MLE' },
    { value: 'pending', label: 'Pendientes' },
  ];
  // Reacciona a la búsqueda por equipo con debounce (signal para que el computed la lea).
  private readonly teamSearch = signal('');

  protected readonly counters = computed(() => {
    const list = this.all();
    let queued = 0;
    let judging = 0;
    let accepted = 0;
    for (const s of list) {
      if (s.status === SubmissionStatus.QUEUED) queued++;
      else if (s.status === SubmissionStatus.JUDGING) judging++;
      if (s.status === SubmissionStatus.DONE && s.verdict === Verdict.AC) accepted++;
    }
    return { queued, judging, accepted, total: list.length };
  });

  protected readonly filtered = computed(() => {
    const cat = this.categoryCtrl.value;
    const prob = this.problemCtrl.value;
    const seg = this.verdictSeg();
    const search = this.teamSearch().trim().toLowerCase();
    const pm = this.problemMap();
    const tm = this.teamMap();
    return this.all().filter((s) => {
      if (prob != null && s.problemId !== prob) return false;
      if (cat != null && pm.get(s.problemId)?.categoryId !== cat) return false;
      if (search && !(tm.get(s.teamId)?.name ?? '').toLowerCase().includes(search)) return false;
      return this.matchesSeg(s, seg);
    });
  });

  constructor() {
    this.loadLookups();
    this.load();

    this.teamCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((v) => this.teamSearch.set(v));

    // Tiempo real: unirse a la edición y actualizar lista + progreso.
    this.rt.joinEdition(this.editionId);
    this.rt.onSubmission().pipe(takeUntilDestroyed()).subscribe((s) => this.upsert(s as IStaffSubmission));
    this.rt.onSubmissionProgress().pipe(takeUntilDestroyed()).subscribe((p) => {
      this.progress.update((m) => ({ ...m, [p.submissionId]: { judged: p.judged, total: p.total } }));
    });

    this.destroyRef.onDestroy(() => this.rt.leave(this.editionId));
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.listForEdition(this.editionId, { limit: PAGE_LIMIT }).subscribe({
      next: (rows) => {
        this.all.set([...rows].sort((a, b) => b.id - a.id));
        this.hasMore.set(rows.length === PAGE_LIMIT);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    const oldest = this.all().at(-1)?.id;
    if (oldest === undefined) return;
    this.loadingMore.set(true);
    this.service.listForEdition(this.editionId, { before: oldest, limit: PAGE_LIMIT }).subscribe({
      next: (rows) => {
        this.merge(rows);
        this.hasMore.set(rows.length === PAGE_LIMIT);
        this.loadingMore.set(false);
      },
      error: (err) => {
        this.loadingMore.set(false);
        this.actionError.set(backendMessage(err, 'No se pudieron cargar más envíos.'));
      },
    });
  }

  private loadLookups(): void {
    this.problemsService.list(this.editionId).subscribe({
      next: (ps) => this.problemMap.set(new Map(ps.map((p) => [p.id, p]))),
      error: () => {},
    });
    // Una página de equipos (suficiente para la mayoría de ediciones); si hay más, el id cae a "#id".
    this.teamsService.list(this.editionId, { page: 1, pageSize: 100 }).subscribe({
      next: (res) =>
        this.teamMap.set(new Map(res.items.map((t) => [t.id, { name: t.name, category: t.category?.name ?? '' }]))),
      error: () => {},
    });
    this.languagesService.catalog().subscribe({
      next: (langs) => this.langMap.set(new Map(langs.map((l) => [l.id, l.code]))),
      error: () => {},
    });
  }

  private matchesSeg(s: IStaffSubmission, seg: VerdictSeg): boolean {
    if (seg === 'all') return true;
    if (seg === 'pending') {
      return s.status === SubmissionStatus.QUEUED || s.status === SubmissionStatus.JUDGING || s.verdict === Verdict.PENDING_REVIEW;
    }
    if (s.status !== SubmissionStatus.DONE) return false;
    if (seg === 'ac') return s.verdict === Verdict.AC;
    if (seg === 'bad') return s.verdict === Verdict.WA || s.verdict === Verdict.CE || s.verdict === Verdict.RE;
    if (seg === 'limit') return s.verdict === Verdict.TLE || s.verdict === Verdict.MLE;
    return true;
  }

  private upsert(s: IStaffSubmission): void {
    const list = this.all();
    const idx = list.findIndex((x) => x.id === s.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = s;
      this.all.set(next);
    } else {
      this.all.set([s, ...list].sort((a, b) => b.id - a.id));
      this.flashNew(s.id);
    }
  }

  private merge(rows: IStaffSubmission[]): void {
    const byId = new Map(this.all().map((s) => [s.id, s]));
    for (const r of rows) byId.set(r.id, r);
    this.all.set([...byId.values()].sort((a, b) => b.id - a.id));
  }

  // Resalta la fila nueva ~2 s (el desvanecido lo hace el CSS; se anula con prefers-reduced-motion).
  private flashNew(id: number): void {
    this.newIds.update((set) => new Set(set).add(id));
    setTimeout(() => {
      this.newIds.update((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }, 30);
  }

  isNew(id: number): boolean {
    return this.newIds().has(id);
  }

  onCategory(): void {
    // Si el problema elegido no es de la categoría, se limpia.
    const cat = this.categoryCtrl.value;
    const prob = this.problemCtrl.value;
    if (cat != null && prob != null && this.problemMap().get(prob)?.categoryId !== cat) {
      this.problemCtrl.setValue(null);
    }
  }

  onVerdictSeg(value: string): void {
    this.verdictSeg.set(value as VerdictSeg);
  }

  // ─── Datos de la fila (resueltos de las búsquedas auxiliares) ───
  minute(contestMs: number): number {
    return Math.max(0, Math.floor(contestMs / 60000));
  }
  teamName(id: number): string {
    return this.teamMap().get(id)?.name ?? '#' + id;
  }
  teamCategory(id: number): string {
    return this.teamMap().get(id)?.category ?? '';
  }
  letter(problemId: number): string {
    return this.problemMap().get(problemId)?.letter ?? '#' + problemId;
  }
  languageCode(id: string): string {
    return this.langMap().get(id) ?? id.slice(0, 6);
  }

  // Progreso "caso 4/20" mientras evalúa, o el caso donde falló cuando ya terminó.
  progressText(s: IStaffSubmission): string | null {
    if (s.status === SubmissionStatus.JUDGING) {
      const p = this.progress()[s.id];
      return p ? `caso ${p.judged}/${p.total}` : null;
    }
    if (s.status === SubmissionStatus.DONE && s.verdict && s.verdict !== Verdict.AC) {
      const failed = s.cases?.find((c) => c.verdict !== Verdict.AC);
      return failed ? `caso ${failed.ordinal}` : null;
    }
    return null;
  }

  downloadCsv(): void {
    this.csvBusy.set(true);
    this.actionError.set(null);
    this.service.downloadCsv(this.editionId).subscribe({
      next: (blob) => {
        this.csvBusy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'envios.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.csvBusy.set(false);
        this.actionError.set(backendMessage(err, 'No se pudo descargar el CSV.'));
      },
    });
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
