import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';
import { EditionStatus, IContestClock, IHealth } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { Badge } from '../../../../shared/ui/badge.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { msToClock, msToMin } from '../../../../shared/time';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ContestClockService } from '../../data/contest-clock.service';
import { HealthService } from '../../data/health.service';

interface StatusView {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'solid';
}

@Component({
  selector: 'oj-contest-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, Badge, ButtonDirective, Alert, EmptyState, ConfirmDialog, DatePipe, RouterLink],
  templateUrl: './contest-control.html',
  styleUrl: './contest-control.css',
})
export class ContestControl {
  private readonly route = inject(ActivatedRoute);
  private readonly clockService = inject(ContestClockService);
  private readonly healthService = inject(HealthService);
  private readonly rt = inject(RealtimeService);
  protected readonly ctx = inject(EditionContext);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = findEditionId(this.route);

  protected readonly clock = signal<IContestClock | null>(null);
  protected readonly clockError = signal(false);
  protected readonly displayMs = signal(0);
  protected readonly health = signal<IHealth | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  private anchorAt = 0;

  private readonly startDialog = viewChild.required<ConfirmDialog>('startDlg');
  private readonly finishDialog = viewChild.required<ConfirmDialog>('finishDlg');

  protected readonly EditionStatus = EditionStatus;
  protected readonly status = computed<EditionStatus | null>(() => this.clock()?.status ?? null);

  protected readonly statusView = computed<StatusView>(() => {
    switch (this.status()) {
      case EditionStatus.SCHEDULED:
        return { label: 'Programado', tone: 'warning' };
      case EditionStatus.RUNNING:
        return { label: 'En curso', tone: 'success' };
      case EditionStatus.PAUSED:
        return { label: 'En pausa', tone: 'warning' };
      case EditionStatus.FINISHED:
        return { label: 'Finalizado', tone: 'solid' };
      default:
        return { label: 'Borrador', tone: 'neutral' };
    }
  });

  protected readonly elapsedText = computed(() => msToClock(this.displayMs()));
  protected readonly durationText = computed(() => {
    const d = this.clock()?.durationMs ?? 0;
    return d > 0 ? msToMin(d) + ' min' : '—';
  });
  protected readonly freezeText = computed(() => {
    const f = this.clock()?.freezeDurationMs ?? 0;
    return f > 0 ? msToMin(f) + ' min' : '—';
  });
  // Inicio: real si ya arrancó, si no la hora programada.
  protected readonly startAt = computed(() => this.ctx.edition()?.started_at ?? this.ctx.edition()?.scheduled_start ?? null);

  protected readonly projectorUrl = `/proyector/${this.editionId}`;
  protected readonly projectorFullUrl =
    (typeof location !== 'undefined' ? location.origin : '') + `/proyector/${this.editionId}`;

  constructor() {
    this.loadClock();
    this.loadHealth();

    // Tiempo real: unirse a la edición y resincronizar en cada clock:update.
    this.rt.joinEdition(this.editionId);
    this.rt.onClock().pipe(takeUntilDestroyed()).subscribe((c) => {
      if (c.editionId === this.editionId) this.setClock(c);
    });

    // Reloj local: 1 s, se detiene al salir.
    const tick = setInterval(() => this.displayMs.set(this.computeElapsed()), 1000);
    // Salud cada 10 s.
    const healthPoll = setInterval(() => this.loadHealth(), 10_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(tick);
      clearInterval(healthPoll);
      this.rt.leave(this.editionId);
    });
  }

  private loadClock(): void {
    this.clockService.get(this.editionId).subscribe({
      next: (c) => this.setClock(c),
      error: () => this.clockError.set(true),
    });
  }

  private setClock(c: IContestClock): void {
    this.clock.set(c);
    this.clockError.set(false);
    this.anchorAt = Date.now();
    this.displayMs.set(this.computeElapsed());
  }

  // Tiempo transcurrido mostrado: mientras corre, se suma el tiempo local desde la última
  // sincronización (que viene del servidor); en pausa/programado/terminado queda fijo.
  private computeElapsed(): number {
    const c = this.clock();
    if (!c) return 0;
    const base = c.status === EditionStatus.RUNNING ? c.elapsedMs + (Date.now() - this.anchorAt) : c.elapsedMs;
    return Math.min(base, c.durationMs);
  }

  private loadHealth(): void {
    this.healthService.get().subscribe({
      next: (h) => this.health.set(h),
      // 503 llega como error pero con el body; si no, se marca todo caído.
      error: (err) => {
        const body = err?.error;
        this.health.set(
          body && typeof body === 'object' && 'database' in body
            ? (body as IHealth)
            : { status: 'error', database: 'down', redis: 'down', judgeWorkers: null, queuedSubmissions: null },
        );
      },
    });
  }

  // ─── Acciones ───
  askStart(): void {
    this.actionError.set(null);
    this.startDialog().open();
  }

  start(): void {
    this.run(this.clockService.start(this.editionId));
  }

  pause(): void {
    this.run(this.clockService.pause(this.editionId));
  }

  resume(): void {
    this.run(this.clockService.resume(this.editionId));
  }

  askFinish(): void {
    this.actionError.set(null);
    this.finishDialog().open();
  }

  finish(): void {
    this.run(this.clockService.finish(this.editionId));
  }

  private run(obs: Observable<IContestClock>): void {
    this.busy.set(true);
    this.actionError.set(null);
    obs.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.setClock(c);
        this.ctx.reload(); // el estado de la edición cambió: refrescar barra y Configuración
      },
      error: (err) => {
        this.busy.set(false);
        this.actionError.set(backendMessage(err, 'No se pudo cambiar el estado del concurso.'));
      },
    });
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
