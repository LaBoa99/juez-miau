import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'oj-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (opt of options(); track opt.value) {
      <button
        type="button"
        class="oj-seg__btn"
        [class.oj-seg__btn--active]="opt.value === value()"
        [attr.aria-pressed]="opt.value === value()"
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
      height: 32px;
      padding: 0 0.75rem;
      border: 0;
      background: var(--oj-bg);
      color: var(--oj-text);
      font-family: var(--oj-font-sans);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: none;
    }
    .oj-seg__btn + .oj-seg__btn {
      border-left: 1px solid var(--oj-border);
    }
    .oj-seg__btn--active {
      background: var(--oj-primary);
      color: var(--oj-bg);
    }
  `,
})
export class Segmented {
  readonly options = input<{ value: string; label: string }[]>([]);
  readonly value = model<string>();
}
