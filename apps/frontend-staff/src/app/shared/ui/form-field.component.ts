import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'oj-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="oj-ff__label" [for]="for()"
      >{{ label() }}@if (optional()) {<span class="oj-ff__optional"> (opcional)</span>}</label
    >
    <ng-content />
    @if (error()) {
      <p class="oj-ff__msg oj-ff__msg--error" [id]="messageId()">{{ error() }}</p>
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
}
