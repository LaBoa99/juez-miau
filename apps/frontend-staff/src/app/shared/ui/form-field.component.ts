import { ChangeDetectionStrategy, Component, computed, contentChild, effect, input, signal } from '@angular/core';
import { AbstractControl, NgControl } from '@angular/forms';
import { errorMessage } from '../validators';

@Component({
  selector: 'oj-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="oj-ff__label" [for]="for()"
      >{{ label() }}@if (optional()) {<span class="oj-ff__optional"> (opcional)</span>}</label
    >
    <ng-content />
    @if (message(); as msg) {
      <p class="oj-ff__msg oj-ff__msg--error" [id]="messageId()" role="alert">{{ msg }}</p>
    } @else if (hint()) {
      <p class="oj-ff__msg oj-ff__msg--hint" [id]="messageId()">{{ hint() }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .oj-ff__label {
      font-size: 12px;
      font-weight: 600;
      color: var(--oj-text);
    }
    .oj-ff__optional {
      font-weight: 400;
      color: var(--oj-text-muted);
    }
    .oj-ff__msg {
      margin: 0;
      font-size: var(--oj-text-small);
    }
    .oj-ff__msg--hint {
      color: var(--oj-text-muted);
    }
    .oj-ff__msg--error {
      color: var(--oj-danger);
    }
  `,
})
export class FormField {
  readonly label = input<string>();
  readonly for = input<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
  readonly optional = input(false);

  protected readonly messageId = computed(() => `${this.for()}-msg`);

  // El control del campo: si está tocado e inválido, su error se muestra aquí sin que cada
  // pantalla lo pase por [error] (antes un formulario inválido no se enviaba y no decía por qué).
  private readonly ngControl = contentChild(NgControl, { descendants: true });
  // Solo formularios reactivos: el [formField] de signal forms (login) trae otro tipo de control.
  private readonly control = computed(() => {
    const c = this.ngControl()?.control;
    return c instanceof AbstractControl ? c : undefined;
  });
  // El estado del control no es una señal: cada evento suyo vuelve a pintar (OnPush).
  private readonly changes = signal(0);

  protected readonly message = computed(() => {
    this.changes();
    const c = this.control();
    return this.error() || (c?.touched && c.invalid ? errorMessage(c.errors) : undefined);
  });

  constructor() {
    effect((onCleanup) => {
      const sub = this.control()?.events.subscribe(() => this.changes.update((n) => n + 1));
      onCleanup(() => sub?.unsubscribe());
    });
  }
}
