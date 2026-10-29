import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'oj-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ message() }}</p>`,
  styles: `
    :host {
      display: block;
      border: 1px dashed var(--oj-border);
      border-radius: var(--oj-radius);
      padding: 24px;
      text-align: center;
    }
    p {
      margin: 0;
      font-size: 13px;
      color: var(--oj-text-muted);
    }
  `,
})
export class EmptyState {
  readonly message = input<string>();
}
