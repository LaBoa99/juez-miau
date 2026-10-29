import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'oj-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>{{ message() }}</p>
    <div class="oj-es__action"><ng-content /></div>
  `,
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
    .oj-es__action {
      margin-top: var(--oj-space-md);
    }
    .oj-es__action:empty {
      display: none;
    }
  `,
})
export class EmptyState {
  readonly message = input<string>();
}
