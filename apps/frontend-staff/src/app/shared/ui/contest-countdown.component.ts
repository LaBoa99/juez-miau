import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { EditionStatus, type IContestClock } from '@concurso/shared-types';
import { msToClock } from '../time';

type Variant = 'card' | 'compact' | 'projector';

const STATUS: Record<EditionStatus, { label: string; tone: string }> = {
  [EditionStatus.DRAFT]: { label: 'Borrador', tone: 'neutral' },
  [EditionStatus.SCHEDULED]: { label: 'Programado', tone: 'neutral' },
  [EditionStatus.RUNNING]: { label: 'En curso', tone: 'success' },
  [EditionStatus.PAUSED]: { label: 'Pausado', tone: 'warning' },
  [EditionStatus.FINISHED]: { label: 'Finalizado', tone: 'solid' },
};
const FROZEN = { label: 'Marcador congelado · El tiempo sigue', tone: 'frozen' };

// Tiempo restante del concurso en HH:MM:SS. Se ancla al último reloj del servidor (elapsedMs) y
// avanza localmente cada segundo mientras corre; en pausa se congela, al terminar marca 00:00:00.
// Variantes: card (tarjeta con encabezado y tira de estado), compact (header) y projector (grande).
@Component({
  selector: 'oj-contest-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'oj-cd oj-cd--' + variant() + ' oj-cd--' + status().tone" },
  template: `
    @if (variant() === 'compact') {
      <span class="oj-cd__time oj-mono" [attr.aria-label]="'Tiempo restante ' + time()">{{ time() }}</span>
      @if (paused()) {
        <span class="oj-cd__compact-status">Pausado</span>
      } @else if (status() === frozenStatus) {
        <span class="oj-cd__compact-status">Congelado</span>
      }
    } @else {
      <section class="oj-cd__card" aria-label="Tiempo restante">
        <header class="oj-cd__head">Tiempo restante</header>
        <div class="oj-cd__time oj-mono" role="timer" aria-live="off">{{ time() }}</div>
        <div class="oj-cd__strip" aria-label="Estado: {{ status().label }}">
          <div class="oj-cd__strip-track" aria-hidden="true">
            @for (i of repeat; track i) {
              <span>{{ status().label }}</span>
            }
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      --cd-tone: var(--oj-neutral);
      --cd-tone-bg: var(--oj-neutral-bg);
      display: block;
      min-width: 0;
    }
    :host(.oj-cd--success) {
      --cd-tone: var(--oj-success);
      --cd-tone-bg: var(--oj-success-bg);
    }
    :host(.oj-cd--warning) {
      --cd-tone: var(--oj-warning);
      --cd-tone-bg: var(--oj-warning-bg);
    }
    :host(.oj-cd--solid) {
      --cd-tone: var(--oj-primary);
      --cd-tone-bg: var(--oj-neutral-bg);
    }
    :host(.oj-cd--frozen) {
      --cd-tone: var(--oj-ice);
      --cd-tone-bg: var(--oj-ice-bg);
    }
    :host(.oj-cd--frozen) .oj-cd__card {
      border-color: var(--oj-ice);
    }
    .oj-cd__time {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
      /* Solo cambia de color: los dígitos nunca se mueven ni se ocultan al congelar */
      transition: color 300ms ease-out;
    }

    /* Compacto (header) */
    :host(.oj-cd--compact) {
      display: inline-flex;
      align-items: center;
      gap: var(--oj-space-xs);
    }
    :host(.oj-cd--compact) .oj-cd__time {
      font-size: 13px;
      color: var(--oj-text);
    }
    .oj-cd__compact-status {
      font-size: 12px;
      color: var(--oj-warning);
    }
    :host(.oj-cd--frozen) .oj-cd__compact-status {
      color: var(--oj-ice);
    }

    /* Tarjeta */
    .oj-cd__card {
      overflow: hidden;
      border: 1px solid var(--oj-border);
      border-radius: 6px;
      background: var(--oj-bg);
    }
    .oj-cd__head {
      padding: var(--oj-space-sm) var(--oj-space-md);
      border-bottom: 1px solid var(--oj-border);
      background: var(--oj-bg-muted);
      font-size: var(--oj-text-label-sm);
      font-weight: var(--oj-text-label-sm-weight);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--oj-text-muted);
    }
    :host(.oj-cd--card) .oj-cd__time,
    :host(.oj-cd--projector) .oj-cd__time {
      padding: var(--oj-space-lg) var(--oj-space-md);
      text-align: center;
      color: var(--cd-tone);
    }
    :host(.oj-cd--card) .oj-cd__time {
      font-size: 2.75rem;
    }
    :host(.oj-cd--projector) .oj-cd__time {
      font-size: 4.5rem;
    }
    :host(.oj-cd--projector) .oj-cd__head {
      font-size: 1rem;
    }

    /* Tira decorativa con el estado, el texto corre de derecha a izquierda */
    .oj-cd__strip {
      /* El texto repetido es muy ancho: que no cuente para el ancho de la tarjeta (si no, desborda la página) */
      contain: inline-size;
      overflow: hidden;
      background: var(--cd-tone);
      color: var(--oj-bg);
    }
    .oj-cd__strip-track {
      display: flex;
      gap: var(--oj-space-xl);
      width: max-content;
      padding: var(--oj-space-xs) 0;
      font-family: var(--oj-font-mono);
      font-size: var(--oj-text-label-sm);
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      white-space: nowrap;
      animation: oj-cd-run 18s linear infinite;
    }
    :host(.oj-cd--projector) .oj-cd__strip-track {
      font-size: 0.95rem;
    }
    :host(.oj-cd--warning) .oj-cd__strip-track,
    :host(.oj-cd--solid) .oj-cd__strip-track {
      animation-play-state: paused;
    }
    @keyframes oj-cd-run {
      to {
        transform: translateX(-50%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .oj-cd__strip-track {
        animation: none;
      }
    }
  `,
})
export class ContestCountdown {
  readonly clock = input.required<IContestClock>();
  readonly variant = input<Variant>('card');
  // El servidor no manda evento al empezar el congelamiento: se detecta aquí, con el reloj local
  readonly frozenChange = output<boolean>();

  protected readonly repeat = Array.from({ length: 16 }, (_, i) => i);
  protected readonly frozenStatus = FROZEN;
  private readonly now = signal(Date.now());
  // Cada reloj nuevo del servidor reinicia el ancla local
  private readonly anchorAt = linkedSignal({ source: this.clock, computation: () => Date.now() });

  private readonly elapsed = computed(() => {
    const c = this.clock();
    return c.status === EditionStatus.RUNNING ? c.elapsedMs + Math.max(0, this.now() - this.anchorAt()) : c.elapsedMs;
  });
  private readonly frozen = computed(() => {
    const c = this.clock();
    return c.status !== EditionStatus.FINISHED && c.freezeDurationMs > 0 && this.elapsed() >= c.durationMs - c.freezeDurationMs;
  });
  protected readonly status = computed(() =>
    this.frozen() && this.clock().status === EditionStatus.RUNNING ? FROZEN : STATUS[this.clock().status],
  );
  protected readonly paused = computed(() => this.clock().status === EditionStatus.PAUSED);
  protected readonly time = computed(() => {
    const c = this.clock();
    if (c.status === EditionStatus.FINISHED) return msToClock(0);
    return msToClock(c.durationMs - Math.min(this.elapsed(), c.durationMs));
  });

  constructor() {
    effect(() => this.frozenChange.emit(this.frozen()));
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }
}
