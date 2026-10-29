import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'oj-side-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="oj-sp__header">
      <h2 class="oj-sp__title">{{ title() }}</h2>
      <button type="button" class="oj-sp__close" (click)="closed.emit()">Cerrar</button>
    </header>
    <div class="oj-sp__body"><ng-content /></div>
  `,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--oj-border);
      border-radius: var(--oj-radius);
      background: var(--oj-bg);
      overflow: hidden;
    }
    .oj-sp__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--oj-space-md);
      padding: var(--oj-space-sm) var(--oj-space-md);
      background: var(--oj-bg-muted);
      border-bottom: 1px solid var(--oj-border);
    }
    .oj-sp__title {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--oj-text);
    }
    .oj-sp__close {
      border: 0;
      background: transparent;
      padding: 0;
      font-family: var(--oj-font-sans);
      font-size: 13px;
      font-weight: 600;
      color: var(--oj-text);
      cursor: pointer;
    }
    .oj-sp__body {
      padding: 16px;
    }
  `,
})
export class SidePanel {
  readonly title = input<string>();
  readonly closed = output<void>();
}
