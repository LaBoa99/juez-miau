import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'oj-segmented',
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
      overflow: hidden;
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
      cursor: pointer;
      box-shadow: none;
    }
    .oj-seg__btn + .oj-seg__btn {
      border-left: 1px solid var(--oj-border);
    }
    /* La opción activa siempre se ve igual, aunque otras estén deshabilitadas. */
    .oj-seg__btn--active {
      background: var(--oj-primary);
      color: var(--oj-bg);
    }
    .oj-seg__btn:disabled:not(.oj-seg__btn--active) {
      color: var(--oj-text-muted);
      cursor: not-allowed;
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
  readonly options = input<{ value: string; label: string; disabled?: boolean }[]>([]);
  readonly value = model<string>();
  readonly size = input<'sm' | 'lg'>('sm');
  readonly disabled = input(false);
}
