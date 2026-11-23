import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EditionStatus, IContestClock, IStandings, IStandingsCategory } from '@concurso/shared-types';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { StandingsCell } from '../../../../shared/ui/standings-cell.component';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProjectorService } from '../../data/projector.service';
import { ContestCountdown } from '../../../../shared/ui/contest-countdown.component';
import { confetti, podium, podiumEmoji } from '../../../standings/podium';

// Dura lo mismo que la secuencia de projector.freeze.css
const FREEZE_ANIMATION_MS = 1000;

// Pantalla 17: proyector público (1920×1080). Fuera del shell, sin guards, sin token.
// Carga por HTTP al entrar, se actualiza por socket (joinPublic) y, si se pierde la conexión,
// respalda por HTTP cada 30 s.
@Component({
  selector: 'oj-projector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Segmented, StandingsCell, ContestCountdown],
  host: { class: 'oj-theme-bodega' },
  templateUrl: './projector.html',
  styleUrls: ['./projector.css', './projector.freeze.css'],
})
export class Projector {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ProjectorService);
  private readonly rt = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly editionId = toSignal(this.route.paramMap.pipe(map((p) => Number(p.get('editionId')))));

  protected readonly clock = signal<IContestClock | null>(null);
  protected readonly standings = signal<IStandings | null>(null);
  protected readonly loaded = signal(false);
  protected readonly unavailable = signal(false);
  protected readonly categorySeg = signal<string>('');

  protected readonly podium = podium;
  protected readonly podiumEmoji = podiumEmoji;
  // Solo los 10 primeros: a 1920×1080 caben sin desplazarse
  protected readonly top = 10;

  private started = false;
  private celebrated = false;
  private freezeTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly finished = computed(() => this.clock()?.status === EditionStatus.FINISHED);
  protected readonly frozen = signal(false);
  // Solo durante la animación: al abrir un proyector ya congelado se ve el estado final
  protected readonly freezing = signal(false);

  protected readonly categories = computed(() => this.standings()?.categories ?? []);
  protected readonly categoryOptions = computed(() =>
    this.categories().map((c) => ({ value: String(c.categoryId), label: c.name })),
  );
  protected readonly current = computed<IStandingsCategory | null>(() => {
    const cats = this.categories();
    return cats.find((c) => String(c.categoryId) === this.categorySeg()) ?? cats[0] ?? null;
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

    // Al terminar el concurso (marcador descongelado) cae confeti, una vez, como en el video del sitio.
    effect(() => {
      if (!this.finished() || this.celebrated) return;
      this.celebrated = true;
      confetti();
    });

    // Respaldo: mientras el socket no esté conectado, recarga por HTTP.
    const fallback = setInterval(() => {
      const id = this.editionId();
      if (id && this.rt.connectionState() !== 'connected') this.fetch(id);
    }, 30_000);

    this.destroyRef.onDestroy(() => {
      clearInterval(fallback);
      clearTimeout(this.freezeTimer);
      const id = this.editionId();
      if (id) this.rt.leave(id);
    });
  }

  private init(id: number): void {
    this.fetch(id);
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

  onFrozen(frozen: boolean): void {
    if (frozen === this.frozen()) return;
    this.frozen.set(frozen);
    clearTimeout(this.freezeTimer);
    this.freezing.set(frozen);
    if (frozen) this.freezeTimer = setTimeout(() => this.freezing.set(false), FREEZE_ANIMATION_MS);
  }

  private setClock(c: IContestClock): void {
    if (!this.clock()) this.frozen.set(c.frozen);
    this.clock.set(c);
    this.loaded.set(true);
    this.unavailable.set(c.status === EditionStatus.DRAFT);
  }

  onCategory(value: string | null | undefined): void {
    this.categorySeg.set(value ?? '');
  }
}
