import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'oj-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'toneClass()',
    '[attr.role]': "tone() === 'error' ? 'alert' : 'status'",
  },
  template: `
    @if (title()) {
      <div class="oj-alert__title">{{ title() }}</div>
    }
    <div class="oj-alert__body"><ng-content /></div>
  `,
  styles: `
    :host {
      display: block;
      border: 1px solid transparent;
      border-radius: var(--oj-radius);
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.25rem;
    }
    .oj-alert__title {
      font-weight: 600;
      margin-bottom: var(--oj-space-2xs);
    }
    :host(.oj-alert--error) {
      color: var(--oj-danger);
      border-color: var(--oj-danger);
      background: var(--oj-danger-bg);
    }
    :host(.oj-alert--warning) {
      color: var(--oj-warning);
      border-color: var(--oj-warning);
      background: var(--oj-warning-bg);
    }
    :host(.oj-alert--success) {
      color: var(--oj-success);
      border-color: var(--oj-success);
      background: var(--oj-success-bg);
    }
    :host(.oj-alert--info) {
      color: var(--oj-neutral);
      border-color: var(--oj-neutral);
      background: var(--oj-neutral-bg);
    }
  `,
})
export class Alert {
  readonly tone = input<'error' | 'warning' | 'success' | 'info'>('info');
  readonly title = input<string>();

  protected readonly toneClass = computed(() => `oj-alert--${this.tone()}`);
}
