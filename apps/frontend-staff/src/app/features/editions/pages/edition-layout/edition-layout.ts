import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IFlag, IStaffSubmission, StaffRole, SubmissionStatus, Verdict } from '@concurso/shared-types';
import { AuthService } from '../../../../core/auth/auth.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { SubmissionsService } from '../../../submissions/data/submissions.service';
import { FlagsService } from '../../../flags/data/flags.service';
import { ClarificationsService } from '../../../clarifications/data/clarifications.service';
import { EditionContext } from './edition-context';
import { TeamsService } from '../../../teams/data/teams.service';
import { ToastService } from '../../../../core/notifications/toast.service';
import { LiveClockService } from '../../../../core/realtime/live-clock.service';
import { ContestClockService } from '../../../contest/data/contest-clock.service';
import { flagToastText, flagTone } from '../../../flags/flag-display';

@Component({
  selector: 'oj-edition-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [EditionContext],
  templateUrl: './edition-layout.html',
  styleUrl: './edition-layout.css',
})
export class EditionLayout {
  private readonly route = inject(ActivatedRoute);
  private readonly submissions = inject(SubmissionsService);
  private readonly flags = inject(FlagsService);
  private readonly clarifications = inject(ClarificationsService);
  private readonly rt = inject(RealtimeService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly teams = inject(TeamsService);
  private readonly toast = inject(ToastService);
  private readonly liveClock = inject(LiveClockService);
  private readonly clockService = inject(ContestClockService);
  protected readonly ctx = inject(EditionContext);

  protected readonly id = Number(this.route.snapshot.paramMap.get('id'));

  // Contador de revisión: ids PENDING_REVIEW, sembrados por HTTP y mantenidos con los eventos del
  // socket (un envío entra al quedar PENDING_REVIEW y sale al resolverlo un juez).
  private readonly pending = signal<ReadonlySet<number>>(new Set());
  protected readonly reviewCount = computed(() => this.pending().size);
  // Contador de alertas abiertas: ids sembrados por HTTP y mantenidos con flag:update.
  private readonly openFlags = signal<ReadonlySet<number>>(new Set());
  // Nombres para los avisos (la alerta solo trae teamId)
  private readonly teamNames = signal<Map<number, string>>(new Map());
  protected readonly flagCount = computed(() => this.openFlags().size);
  // Preguntas sin responder: sembradas por HTTP y mantenidas con clarification:update.
  private readonly unanswered = signal<ReadonlySet<number>>(new Set());
  protected readonly clarificationCount = computed(() => this.unanswered().size);
  // El backend no tiene "código" de edición: se muestra el nombre.
  protected readonly code = computed(() => this.ctx.edition()?.name ?? '');

  private readonly allSections = [
    { label: 'Configuración', path: 'configuracion' },
    { label: 'Equipos', path: 'equipos' },
    { label: 'Problemas', path: 'problemas' },
    { label: 'Concurso', path: 'concurso' },
    { label: 'Envíos', path: 'envios' },
    { label: 'Marcador', path: 'marcador' },
    { label: 'Revisión', path: 'revision' },
    { label: 'Alertas', path: 'alertas' },
    { label: 'Aclaraciones', path: 'aclaraciones' },
  ];

  // Un OBSERVER solo ve Envíos, Marcador y Alertas; cualquier otro rol (y superadmin) ve todo.
  private static readonly observerSections = new Set(['envios', 'marcador', 'alertas']);
  protected readonly sections = computed(() =>
    !this.auth.isSuperadmin() && this.auth.roleInEdition(this.id) === StaffRole.OBSERVER
      ? this.allSections.filter((s) => EditionLayout.observerSections.has(s.path))
      : this.allSections,
  );

  constructor() {
    this.ctx.load(this.id);

    this.submissions.reviewQueue(this.id).subscribe({
      next: (rows) => this.pending.set(new Set(rows.map((r) => r.id))),
      error: () => {},
    });

    this.flags.list(this.id, { open: true }).subscribe({
      next: (rows) => this.openFlags.set(new Set(rows.map((f) => f.id))),
      error: () => {},
    });

    // Reloj de la edición para el header, Marcador y Concurso
    this.clockService.get(this.id).subscribe({ next: (c) => this.liveClock.set(c), error: () => {} });
    this.rt.onClock().pipe(takeUntilDestroyed()).subscribe((c) => {
      if (c.editionId === this.id) this.liveClock.set(c);
    });

    this.teams.listAll(this.id).subscribe({
      next: (teams) => this.teamNames.set(new Map(teams.map((t) => [t.id, t.name]))),
      error: () => {},
    });

    this.clarifications.list(this.id).subscribe({
      next: (rows) => this.unanswered.set(new Set(rows.filter((c) => c.answer == null && c.rejectedAt == null).map((c) => c.id))),
      error: () => {},
    });

    this.rt.joinEdition(this.id);
    this.rt.onSubmission().pipe(takeUntilDestroyed()).subscribe((s) => this.track(s as IStaffSubmission));
    this.rt.onFlag().pipe(takeUntilDestroyed()).subscribe((f) => this.trackFlag(f));
    this.rt.onClarification().pipe(takeUntilDestroyed()).subscribe((c) => {
      const next = new Set(this.unanswered());
      c.answer == null && c.rejectedAt == null ? next.add(c.id) : next.delete(c.id);
      this.unanswered.set(next);
    });
    this.rt.onClarificationDelete().pipe(takeUntilDestroyed()).subscribe(({ id }) => {
      if (!this.unanswered().has(id)) return;
      const next = new Set(this.unanswered());
      next.delete(id);
      this.unanswered.set(next);
    });
    this.destroyRef.onDestroy(() => {
      this.rt.leave(this.id);
      this.toast.clear();
      this.liveClock.clear(this.id);
    });
  }

  private track(s: IStaffSubmission): void {
    const inReview = s.status === SubmissionStatus.DONE && s.verdict === Verdict.PENDING_REVIEW;
    const set = this.pending();
    if (inReview === set.has(s.id)) return;
    const next = new Set(set);
    inReview ? next.add(s.id) : next.delete(s.id);
    this.pending.set(next);
  }

  private trackFlag(f: IFlag): void {
    const open = f.resolvedAt == null;
    const set = this.openFlags();
    if (open === set.has(f.id)) return;
    const next = new Set(set);
    open ? next.add(f.id) : next.delete(f.id);
    this.openFlags.set(next);
    // Alerta nueva: aviso en la esquina (las resueltas no avisan)
    if (open) this.toast.show(this.teamNames().get(f.teamId) ?? 'Equipo #' + f.teamId, flagToastText(f.type), flagTone(f.type));
  }
}
