import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface StepperItem {
  key: string;
  label: string;
  done: boolean;
  disabled?: boolean;
  // Se verá afectado por lo que se edita ahora (amarillo, con su tramo de línea)
  warn?: boolean;
}

// Barra de avance con puntos: cada paso es un botón; el actual lleva aria-current="step".
@Component({
  selector: 'oj-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="oj-stp">
      @for (s of steps(); track s.key; let i = $index) {
        <li class="oj-stp__item" [class.oj-stp__item--done]="s.done" [class.oj-stp__item--warn]="s.warn && s.key !== current()"
            [class.oj-stp__item--current]="s.key === current()">
          <button type="button" class="oj-stp__btn" [disabled]="s.disabled" [attr.aria-current]="s.key === current() ? 'step' : null"
                  (click)="select.emit(s.key)">
            <span class="oj-stp__dot" [class.oj-stp__dot--check]="s.done && s.key !== current()" aria-hidden="true">{{ s.done && s.key !== current() ? '✓' : i + 1 }}</span>
            <span class="oj-stp__label">{{ s.label }}</span>
            <span class="oj-visually-hidden">{{ s.warn && s.key !== current() ? '(se verá afectado)' : s.done ? '(completo)' : '(pendiente)' }}</span>
          </button>
        </li>
      }
    </ol>
  `,
  styles: `
    .oj-stp { display: flex; margin: 0; padding: 0; list-style: none; }
    .oj-stp__item { position: relative; flex: 1 1 0; min-width: 0; }
    /* Línea hacia el punto anterior; verde si ese tramo ya está completo */
    /* Va de borde a borde entre los dos círculos (28px de ancho + 6px de aire) y debajo de ellos */
    .oj-stp__item + .oj-stp__item::before {
      content: ''; position: absolute; z-index: 0; top: 13px; right: calc(50% + 20px); width: calc(100% - 40px);
      height: 2px; background: var(--oj-border);
    }
    .oj-stp__item--done + .oj-stp__item::before { background: var(--oj-success); }
    .oj-stp__btn {
      position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: var(--oj-space-xs); width: 100%;
      padding: 0; border: 0; background: none; cursor: pointer; font-family: var(--oj-font-sans); color: var(--oj-text-muted);
    }
    .oj-stp__btn:disabled { cursor: not-allowed; opacity: 0.5; }
    .oj-stp__dot {
      display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; box-sizing: border-box;
      border: 2px solid var(--oj-border); border-radius: 50%; background: var(--oj-bg);
      font-family: var(--oj-font-mono); font-size: 12px; font-weight: 700; line-height: 1;
    }
    /* La palomita en sans: en la mono queda corrida hacia abajo */
    .oj-stp__dot--check { font-family: var(--oj-font-sans); font-size: 13px; }
    .oj-stp__label { font-size: 12px; text-align: center; }
    .oj-stp__item--done .oj-stp__dot { border-color: var(--oj-success); color: var(--oj-success); }
    /* Afectado por lo que se edita: amarillo, y el tramo que llega a él también */
    .oj-stp__item--warn .oj-stp__dot { border-color: var(--oj-warning); color: var(--oj-warning); background: var(--oj-warning-bg); }
    .oj-stp__item--warn .oj-stp__label { color: var(--oj-warning); }
    .oj-stp__item + .oj-stp__item--warn::before { background: var(--oj-warning); }
    .oj-stp__item--current .oj-stp__dot { border-color: var(--oj-text); background: var(--oj-text); color: var(--oj-bg); }
    .oj-stp__item--current .oj-stp__label { color: var(--oj-text); font-weight: 600; }
    @media (max-width: 600px) { .oj-stp__label { display: none; } }
  `,
})
export class Stepper {
  readonly steps = input.required<StepperItem[]>();
  readonly current = input.required<string>();
  readonly select = output<string>();
}
