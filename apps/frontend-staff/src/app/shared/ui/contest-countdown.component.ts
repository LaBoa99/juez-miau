import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
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
    .oj-cd__time {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
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

  protected readonly repeat = Array.from({ length: 16 }, (_, i) => i);
  private readonly now = signal(Date.now());
  private anchorAt = Date.now();

  protected readonly status = computed(() => STATUS[this.clock().status]);
  protected readonly paused = computed(() => this.clock().status === EditionStatus.PAUSED);
  protected readonly time = computed(() => {
    const c = this.clock();
    if (c.status === EditionStatus.FINISHED) return msToClock(0);
    const elapsed = c.status === EditionStatus.RUNNING ? c.elapsedMs + (this.now() - this.anchorAt) : c.elapsedMs;
    return msToClock(c.durationMs - Math.min(elapsed, c.durationMs));
  });

  constructor() {
    // Cada reloj nuevo del servidor reinicia el ancla local
    effect(() => {
      this.clock();
      this.anchorAt = Date.now();
      this.now.set(this.anchorAt);
    });
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }
}
