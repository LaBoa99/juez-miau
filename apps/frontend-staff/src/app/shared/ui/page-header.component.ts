import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'oj-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="oj-ph__titles">
      <h1 class="oj-ph__title">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="oj-ph__subtitle">{{ subtitle() }}</p>
      }
    </div>
    <div class="oj-ph__actions">
      <ng-content select="[actions]" />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--oj-space-md);
    }
    .oj-ph__title {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      color: var(--oj-text);
    }
    .oj-ph__subtitle {
      margin: var(--oj-space-2xs) 0 0;
      font-size: 13px;
      color: var(--oj-text-muted);
    }
    .oj-ph__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--oj-space-sm);
    }
  `,
})
export class PageHeader {
  readonly title = input<string>();
  readonly subtitle = input<string>();
}
