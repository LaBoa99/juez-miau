import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EditionStatus, IContestClock, IStandings, IStandingsCategory } from '@concurso/shared-types';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { StandingsCell } from '../../../../shared/ui/standings-cell.component';
import { msToClock } from '../../../../shared/time';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProjectorService } from '../../data/projector.service';

// Pantalla 17: proyector público (1920×1080). Fuera del shell, sin guards, sin token.
// Carga por HTTP al entrar, se actualiza por socket (joinPublic) y, si se pierde la conexión,
// respalda por HTTP cada 30 s.
@Component({
  selector: 'oj-projector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, Segmented, StandingsCell],
  templateUrl: './projector.html',
  styleUrl: './projector.css',
})
export class Projector {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ProjectorService);
  private readonly rt = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly editionId = toSignal(this.route.paramMap.pipe(map((p) => Number(p.get('editionId')))));

  protected readonly clock = signal<IContestClock | null>(null);
  protected readonly standings = signal<IStandings | null>(null);
  protected readonly displayMs = signal(0);
  protected readonly loaded = signal(false);
  protected readonly unavailable = signal(false);
  protected readonly isFullscreen = signal(!!document.fullscreenElement);
  protected readonly paused = signal(false);
  protected readonly categorySeg = signal<string>('');

  private anchorAt = 0;
  private started = false;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly finished = computed(() => this.clock()?.status === EditionStatus.FINISHED);
  protected readonly frozen = computed(() => this.clock()?.frozen ?? false);
  protected readonly timeText = computed(() => msToClock(this.displayMs()));

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

    const tick = setInterval(() => this.displayMs.set(this.computeRemaining()), 1000);
    const rotate = setInterval(() => this.rotate(), 20_000);
    // Respaldo: mientras el socket no esté conectado, recarga por HTTP.
    const fallback = setInterval(() => {
      const id = this.editionId();
      if (id && this.rt.connectionState() !== 'connected') this.fetch(id);
    }, 30_000);

    const onFs = () => this.isFullscreen.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);

    this.destroyRef.onDestroy(() => {
      clearInterval(tick);
      clearInterval(rotate);
      clearInterval(fallback);
      document.removeEventListener('fullscreenchange', onFs);
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

  private setClock(c: IContestClock): void {
    this.clock.set(c);
    this.loaded.set(true);
    this.unavailable.set(c.status === EditionStatus.DRAFT);
    this.anchorAt = Date.now();
    this.displayMs.set(this.computeRemaining());
  }

  // Tiempo restante: duración menos lo transcurrido (misma sincronización que el 16: mientras corre
  // se suma el tiempo local desde la última señal del servidor; en pausa/terminado queda fijo).
  private computeRemaining(): number {
    const c = this.clock();
    if (!c) return 0;
    const elapsed = c.status === EditionStatus.RUNNING ? c.elapsedMs + (Date.now() - this.anchorAt) : c.elapsedMs;
    return Math.max(0, c.durationMs - Math.min(elapsed, c.durationMs));
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
