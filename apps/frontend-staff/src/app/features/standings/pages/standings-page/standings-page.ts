import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IContestClock, IStandings } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { StandingsCell } from '../../../../shared/ui/standings-cell.component';
import { minToMs } from '../../../../shared/time';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ContestClockService } from '../../../contest/data/contest-clock.service';
import { podium, podiumEmoji } from '../../podium';
import { StandingsService } from '../../data/standings.service';
import { ContestCountdown } from '../../../../shared/ui/contest-countdown.component';

@Component({
  selector: 'oj-standings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, PageHeader, ButtonDirective, Alert, EmptyState, StandingsCell, ContestCountdown],
  templateUrl: './standings-page.html',
  styleUrl: './standings-page.css',
})
export class StandingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(StandingsService);
  private readonly clockService = inject(ContestClockService);
  protected readonly podium = podium;
  protected readonly podiumEmoji = podiumEmoji;
  protected readonly ctx = inject(EditionContext);
  private readonly rt = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = findEditionId(this.route);

  protected readonly data = signal<IStandings | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly clock = signal<IContestClock | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly csvBusy = signal(false);
  // Equipo cuya suspensión se está guardando
  protected readonly suspending = signal<number | null>(null);

  protected readonly categories = computed(() => this.data()?.categories ?? []);
  protected readonly hasRows = computed(() => this.categories().some((c) => c.rows.length > 0));

  // Lo avisa el reloj: el servidor no manda evento al empezar el congelamiento
  protected readonly frozen = signal(false);
  // Hora en que empezó el congelamiento del público. shortcut: no descuenta pausas; si se usa mucho
  // con concursos pausados, calcularla desde el reloj del servidor.
  protected readonly freezeAt = computed<Date | null>(() => {
    const started = this.ctx.edition()?.started_at;
    const minute = this.data()?.freezeMinute;
    if (!started || minute == null) return null;
    return new Date(new Date(started).getTime() + minToMs(minute));
  });

  constructor() {
    this.load();
    this.clockService.get(this.editionId).subscribe({ next: (c) => this.clock.set(c), error: () => {} });

    this.rt.joinEdition(this.editionId);
    this.rt
      .onStandings()
      .pipe(takeUntilDestroyed())
      .subscribe((s) => {
        // El staff recibe las dos vistas (está en ambas salas); aquí solo la completa.
        if (s.view === 'staff' && s.editionId === this.editionId) this.data.set(s);
      });
    this.rt
      .onClock()
      .pipe(takeUntilDestroyed())
      .subscribe((c) => {
        if (c.editionId === this.editionId) this.clock.set(c);
      });

    this.destroyRef.onDestroy(() => this.rt.leave(this.editionId));
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.getForStaff(this.editionId).subscribe({
      next: (s) => {
        this.data.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  toggleSuspended(teamId: number, suspended: boolean): void {
    this.suspending.set(teamId);
    this.actionError.set(null);
    this.service.setSuspended(this.editionId, teamId, suspended).subscribe({
      next: () => {
        this.suspending.set(null);
        this.load();
      },
      error: (err) => {
        this.suspending.set(null);
        this.actionError.set(backendMessage(err, 'No se pudo cambiar la suspensión del equipo.'));
      },
    });
  }

  openProjector(): void {
    window.open(`/proyector/${this.editionId}`, '_blank', 'noopener');
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
        a.download = 'marcador.csv';
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
