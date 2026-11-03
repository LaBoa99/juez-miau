import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TooltipDirective } from './tooltip.directive';

@Component({
  selector: 'oj-segmented',
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.oj-seg--lg]': "size() === 'lg'",
  },
  template: `
    @for (opt of options(); track opt.value) {
      <button
        type="button"
        class="oj-seg__btn"
        [class.oj-seg__btn--active]="opt.value === value()"
        [attr.aria-pressed]="opt.value === value()"
        [disabled]="disabled() || opt.disabled"
        (click)="value.set(opt.value)"
        [ojTooltip]="opt.hint ?? ''"
        [class.oj-seg__btn--plain]="!opt.hint"
      >
        {{ opt.label }}
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      border: 1px solid var(--oj-border);
      border-radius: var(--oj-radius);
    }
    /* Sin overflow:hidden (recortaría el tooltip): las esquinas las redondean la primera y la última opción */
    .oj-seg__btn:first-child {
      border-radius: var(--oj-radius) 0 0 var(--oj-radius);
    }
    .oj-seg__btn:last-child {
      border-radius: 0 var(--oj-radius) var(--oj-radius) 0;
    }
    .oj-seg__btn:only-child {
      border-radius: var(--oj-radius);
    }
    .oj-seg__btn {
      height: 30px;
      padding: 0 12px;
      border: 0;
      background: var(--oj-bg);
      color: var(--oj-text);
      font-family: var(--oj-font-sans);
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      cursor: pointer;
      box-shadow: none;
    }
    /* Línea divisoria entre opciones (todas menos la primera). */
    .oj-seg__btn + .oj-seg__btn {
      border-left: 1px solid var(--oj-border);
    }
    /* La opción activa siempre se ve igual, aunque otras estén deshabilitadas. */
    .oj-seg__btn--active {
      background: var(--oj-primary);
      color: var(--oj-bg);
    }
    /* La divisoria no debe verse como borde doble junto al bloque oscuro de la opción activa. */
    .oj-seg__btn--active {
      border-left-color: transparent;
    }
    .oj-seg__btn--active + .oj-seg__btn {
      border-left-color: transparent;
    }
    /* Opciones sin ayuda: no se muestra el globo vacío */
    .oj-seg__btn--plain ::ng-deep > .oj-tooltip {
      display: none;
    }
    .oj-seg__btn:disabled:not(.oj-seg__btn--active) {
      color: var(--oj-text-muted);
      cursor: not-allowed;
    }
    /* Foco de teclado visible, con el outline hacia dentro para no romper el borde del grupo. */
    .oj-seg__btn:focus-visible {
      outline: 1px solid var(--oj-text);
      outline-offset: -1px;
    }
    /* Tamaño grande: solo para el proyector. */
    :host(.oj-seg--lg) .oj-seg__btn {
      height: 52px;
      padding: 0 20px;
      font-size: 22px;
    }
  `,
})
export class Segmented {
  // hint: texto de ayuda que se muestra con hover y foco de teclado
  readonly options = input<{ value: string; label: string; disabled?: boolean; hint?: string }[]>([]);
  readonly value = model<string>();
  readonly size = input<'sm' | 'lg'>('sm');
  readonly disabled = input(false);
}
