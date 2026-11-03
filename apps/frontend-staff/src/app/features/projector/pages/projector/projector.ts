import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EditionStatus, IContestClock, IStandings, IStandingsCategory } from '@concurso/shared-types';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { StandingsCell } from '../../../../shared/ui/standings-cell.component';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProjectorService } from '../../data/projector.service';
import { ContestCountdown } from '../../../../shared/ui/contest-countdown.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { RoomsService } from '../../../editions/rooms/data/rooms.service';
import { TeamsService } from '../../../teams/data/teams.service';
import { filterByRoom } from '../../../standings/room-filter';

// Pantalla 17: proyector público (1920×1080). Fuera del shell, sin guards, sin token.
// Carga por HTTP al entrar, se actualiza por socket (joinPublic) y, si se pierde la conexión,
// respalda por HTTP cada 30 s.
@Component({
  selector: 'oj-projector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, Segmented, StandingsCell, ContestCountdown],
  templateUrl: './projector.html',
  styleUrl: './projector.css',
})
export class Projector {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ProjectorService);
  private readonly rt = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly roomsService = inject(RoomsService);
  private readonly teamsService = inject(TeamsService);

  private readonly editionId = toSignal(this.route.paramMap.pipe(map((p) => Number(p.get('editionId')))));

  protected readonly clock = signal<IContestClock | null>(null);
  protected readonly standings = signal<IStandings | null>(null);
  protected readonly loaded = signal(false);
  protected readonly unavailable = signal(false);
  protected readonly isFullscreen = signal(!!document.fullscreenElement);
  protected readonly paused = signal(false);
  protected readonly categorySeg = signal<string>('');

  private started = false;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly finished = computed(() => this.clock()?.status === EditionStatus.FINISHED);
  protected readonly frozen = computed(() => this.clock()?.frozen ?? false);

  // Filtro por salón: el marcador público no trae el salón; solo con sesión de staff en este
  // navegador se puede cruzar con la lista de equipos (sin sesión se ve todo, como antes)
  protected readonly rooms = signal<{ id: number; name: string; categoryId: number | null }[]>([]);
  private readonly roomOf = signal<Map<number, number | null>>(new Map());
  protected readonly roomId = signal<number | null>(null);
  protected readonly roomName = computed(() => this.rooms().find((r) => r.id === this.roomId())?.name ?? null);

  protected readonly categories = computed(() => this.standings()?.categories ?? []);
  protected readonly categoryOptions = computed(() =>
    this.categories().map((c) => ({ value: String(c.categoryId), label: c.name })),
  );
  protected readonly current = computed<IStandingsCategory | null>(() => {
    const cats = this.categories();
    const cat = cats.find((c) => String(c.categoryId) === this.categorySeg()) ?? cats[0] ?? null;
    return cat && filterByRoom(cat, this.roomOf(), this.roomId());
  });

  constructor() {
    // Arranca en cuanto se conoce el id de la ruta (una sola vez).
    effect(() => {
      const id = this.editionId();
      if (!id || this.started) return;
      this.started = true;
      this.init(id);
    });

    // Si la categoría seleccionada ya no existe, vuelve a la primera.
    effect(() => {
      const opts = this.categoryOptions();
      if (opts.length && !opts.some((o) => o.value === this.categorySeg())) {
        this.categorySeg.set(opts[0].value);
      }
    });

    const rotate = setInterval(() => this.rotate(), 20_000);
    // Respaldo: mientras el socket no esté conectado, recarga por HTTP.
    const fallback = setInterval(() => {
      const id = this.editionId();
      if (id && this.rt.connectionState() !== 'connected') this.fetch(id);
    }, 30_000);

    const onFs = () => this.isFullscreen.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);

    this.destroyRef.onDestroy(() => {
      clearInterval(rotate);
      clearInterval(fallback);
      document.removeEventListener('fullscreenchange', onFs);
      const id = this.editionId();
      if (id) this.rt.leave(id);
    });
  }

  private init(id: number): void {
    this.fetch(id);
    if (this.auth.isAuthenticated()) {
      this.roomsService.list(id).subscribe({
        next: (rooms) => this.rooms.set(rooms.map((r) => ({ id: r.id, name: r.name, categoryId: r.category_id ?? null }))),
        error: () => {},
      });
      this.teamsService.listAll(id).subscribe({
        next: (teams) => this.roomOf.set(new Map(teams.map((t) => [t.id, t.room?.id ?? null]))),
        error: () => {},
      });
    }
    this.rt.joinPublic(id);
    this.rt
      .onClock()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => {
        if (c.editionId === id) this.setClock(c);
      });
    this.rt
      .onStandings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => {
        if (s.view === 'public' && s.editionId === id) this.standings.set(s);
      });
  }

  private fetch(id: number): void {
    this.service.clock(id).subscribe({
      next: (c) => this.setClock(c),
      // Sin reloj y sin haber cargado nunca: la edición no existe → no disponible.
      error: () => {
        if (!this.loaded()) this.unavailable.set(true);
      },
    });
    this.service.standings(id).subscribe({ next: (s) => this.standings.set(s), error: () => {} });
  }

  private setClock(c: IContestClock): void {
    this.clock.set(c);
    this.loaded.set(true);
    this.unavailable.set(c.status === EditionStatus.DRAFT);
  }

  onRoom(value: string): void {
    const id = value ? Number(value) : null;
    this.roomId.set(id);
    // Cada salón es un nivel: se fija su categoría y se detiene la rotación
    const categoryId = this.rooms().find((r) => r.id === id)?.categoryId;
    if (categoryId != null) {
      this.categorySeg.set(String(categoryId));
      this.paused.set(true);
    }
  }

  private rotate(): void {
    if (this.paused() || this.reducedMotion) return;
    const opts = this.categoryOptions();
    if (opts.length < 2) return;
    const i = opts.findIndex((o) => o.value === this.categorySeg());
    this.categorySeg.set(opts[(i + 1) % opts.length].value);
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }
}
