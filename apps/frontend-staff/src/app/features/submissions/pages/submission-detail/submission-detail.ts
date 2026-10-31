import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IProblemDetail,
  IStaffSubmission,
  IStaffSubmissionDetail,
  ISubmissionCase,
  ISubmissionHistoryEntry,
  StaffRole,
  SubmissionStatus,
  Verdict,
} from '@concurso/shared-types';
import { Badge } from '../../../../shared/ui/badge.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Alert } from '../../../../shared/ui/alert.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { CodeBlock } from '../../../../shared/ui/code-block.component';
import { VerdictPipe } from '../../../../shared/pipes/verdict.pipe';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { AuthService } from '../../../../core/auth/auth.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProblemsService } from '../../../problems/data/problems.service';
import { TeamsService } from '../../../teams/data/teams.service';
import { EditionLanguagesService } from '../../../editions/edition-languages/data/edition-languages.service';
import { SubmissionsService } from '../../data/submissions.service';

@Component({
  selector: 'oj-submission-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    Badge,
    ButtonDirective,
    Alert,
    Modal,
    FormField,
    CodeBlock,
    VerdictPipe,
  ],
  templateUrl: './submission-detail.html',
  styleUrl: './submission-detail.css',
})
export class SubmissionDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SubmissionsService);
  private readonly problemsService = inject(ProblemsService);
  private readonly teamsService = inject(TeamsService);
  private readonly languagesService = inject(EditionLanguagesService);
  private readonly auth = inject(AuthService);
  private readonly rt = inject(RealtimeService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = findEditionId(this.route);
  protected readonly id = Number(this.route.snapshot.paramMap.get('submissionId'));

  protected readonly SubmissionStatus = SubmissionStatus;
  protected readonly Verdict = Verdict;

  protected readonly detail = signal<IStaffSubmissionDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);
  protected readonly history = signal<ISubmissionHistoryEntry[]>([]);
  protected readonly progress = signal<{ judged: number; total: number } | null>(null);
  protected readonly actionError = signal<string | null>(null);

  private readonly problem = signal<IProblemDetail | null>(null);
  protected readonly teamName = signal('');
  private readonly langMap = signal<Map<string, { code: string; ext: string }>>(new Map());

  // Re-evaluar
  private readonly rejudgeModal = viewChild.required(Modal);
  protected readonly reasonCtrl = this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(500)]);
  protected readonly rejudgeSaving = signal(false);
  protected readonly rejudgeError = signal<string | null>(null);
  protected readonly rejudgeDone = signal(false);

  protected readonly canRejudge = computed(() => {
    const role = this.auth.roleInEdition(this.editionId);
    return this.auth.isSuperadmin() || role === StaffRole.ADMIN || role === StaffRole.JUDGE;
  });

  protected readonly letter = computed(() => this.problem()?.letter ?? '');
  protected readonly title = computed(() => this.problem()?.title ?? '');
  protected readonly testsetVersion = computed(() => {
    const d = this.detail();
    const t = this.problem()?.testsets.find((v) => v.id === d?.testsetId);
    return t ? 'v' + t.version : d ? '#' + d.testsetId : '';
  });
  protected readonly langCode = computed(() => {
    const d = this.detail();
    return d ? (this.langMap().get(d.languageId)?.code ?? d.languageId.slice(0, 6)) : '';
  });
  protected readonly codeSize = computed(() => {
    const src = this.detail()?.source ?? '';
    const bytes = new Blob([src]).size;
    return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB';
  });
  protected readonly firstFailed = computed<ISubmissionCase | null>(
    () => this.detail()?.cases.find((c) => c.verdict !== Verdict.AC) ?? null,
  );

  constructor() {
    this.load();
    this.languagesService.catalog().subscribe({
      next: (langs) => this.langMap.set(new Map(langs.map((l) => [l.id, { code: l.code, ext: l.file_ext }]))),
      error: () => {},
    });

    this.rt.joinEdition(this.editionId);
    this.rt.onSubmission().pipe(takeUntilDestroyed()).subscribe((s) => {
      if (s.id === this.id) this.applyUpdate(s as IStaffSubmission);
    });
    this.rt.onSubmissionProgress().pipe(takeUntilDestroyed()).subscribe((p) => {
      if (p.submissionId === this.id) this.progress.set({ judged: p.judged, total: p.total });
    });
    this.destroyRef.onDestroy(() => this.rt.leave(this.editionId));
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    this.service.getForStaff(this.id).subscribe({
      next: (d) => {
        this.loading.set(false);
        this.detail.set(d);
        this.loadRefs(d);
      },
      error: (err) => {
        this.loading.set(false);
        err?.status === 404 ? this.notFound.set(true) : this.loadError.set(true);
      },
    });
    this.service.history(this.id).subscribe({
      next: (h) => this.history.set([...h].sort((a, b) => a.judgeRound - b.judgeRound)),
      error: () => {},
    });
  }

  private loadRefs(d: IStaffSubmissionDetail): void {
    this.problemsService.get(d.problemId).subscribe({ next: (p) => this.problem.set(p), error: () => {} });
    this.teamsService.get(d.teamId).subscribe({ next: (t) => this.teamName.set(t.name), error: () => this.teamName.set('#' + d.teamId) });
  }

  // El socket manda IStaffSubmission (sin source): se fusiona conservando el código.
  private applyUpdate(s: IStaffSubmission): void {
    const cur = this.detail();
    if (!cur) return;
    this.detail.set({ ...cur, ...s, source: cur.source });
    if (s.status !== SubmissionStatus.JUDGING) this.progress.set(null);
  }

  minute(): number {
    return Math.max(0, Math.floor((this.detail()?.contestMs ?? 0) / 60000));
  }

  caseTone(c: ISubmissionCase): 'ac' | 'bad' {
    return c.verdict === Verdict.AC ? 'ac' : 'bad';
  }

  originLabel(e: ISubmissionHistoryEntry): string {
    if (e.judgeRound === 0) return 'Envío original';
    if (e.rejudgedBy !== null) return 'Re-evaluación manual · #' + e.rejudgedBy;
    return 'Republicación de testset';
  }

  // ─── Acciones ───
  downloadCode(): void {
    const d = this.detail();
    if (!d) return;
    const ext = this.langMap().get(d.languageId)?.ext ?? 'txt';
    const url = URL.createObjectURL(new Blob([d.source], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `envio-${d.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  openRejudge(): void {
    this.reasonCtrl.reset('');
    this.rejudgeError.set(null);
    this.rejudgeDone.set(false);
    this.rejudgeModal().open();
  }

  closeRejudge(): void {
    this.rejudgeModal().close();
  }

  submitRejudge(): void {
    if (this.reasonCtrl.invalid) {
      this.reasonCtrl.markAsTouched();
      return;
    }
    this.rejudgeSaving.set(true);
    this.rejudgeError.set(null);
    this.service.rejudge(this.id, this.reasonCtrl.value).subscribe({
      next: () => {
        this.rejudgeSaving.set(false);
        this.rejudgeModal().close();
        this.rejudgeDone.set(true);
        this.load(); // vuelve a quedar en cola; el veredicto llega por socket
      },
      error: (err) => {
        this.rejudgeSaving.set(false);
        this.rejudgeError.set(backendMessage(err, 'No se pudo enviar a la cola.'));
      },
    });
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
