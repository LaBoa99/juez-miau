import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IContestClock, IStandings, IStandingsCategory } from '@concurso/shared-types';
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
import { RoomsService } from '../../../editions/rooms/data/rooms.service';
import { TeamsService } from '../../../teams/data/teams.service';
import { filterByRoom } from '../../room-filter';

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
  private readonly roomsService = inject(RoomsService);
  private readonly teamsService = inject(TeamsService);

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
  // Filtro por salón: el marcador no trae el salón, se cruza con la lista de equipos
  protected readonly rooms = signal<{ id: number; name: string; categoryId: number | null }[]>([]);
  private readonly roomOf = signal<Map<number, number | null>>(new Map());
  protected readonly roomId = signal<number | null>(null);

  // Un solo selector (salón = nivel): "Todos los salones" muestra cada categoría en su tabla; un
  // salón muestra solo su categoría (o todas, si el salón no tiene categoría) con sus equipos
  protected readonly shown = computed<IStandingsCategory[]>(() => {
    const roomId = this.roomId();
    if (roomId == null) return this.categories();
    const categoryId = this.rooms().find((r) => r.id === roomId)?.categoryId ?? null;
    return this.categories()
      .filter((c) => categoryId == null || c.categoryId === categoryId)
      .map((c) => filterByRoom(c, this.roomOf(), roomId));
  });
  protected readonly roomEmpty = computed(() => this.shown().every((c) => c.rows.length === 0));
  protected readonly hasRows = computed(() => this.categories().some((c) => c.rows.length > 0));

  // El público está congelado según el reloj (el backend ya lo calcula en IContestClock).
  protected readonly frozen = computed(() => this.clock()?.frozen ?? false);
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
    this.roomsService.list(this.editionId).subscribe({
      next: (rooms) => this.rooms.set(rooms.map((r) => ({ id: r.id, name: r.name, categoryId: r.category_id ?? null }))),
      error: () => {},
    });
    this.teamsService.listAll(this.editionId).subscribe({
      next: (teams) => this.roomOf.set(new Map(teams.map((t) => [t.id, t.room?.id ?? null]))),
      error: () => {},
    });
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

  onRoom(value: string): void {
    this.roomId.set(value ? Number(value) : null);
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
