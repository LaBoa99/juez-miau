import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'oj-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'toneClass()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: inline-block;
      font-family: var(--oj-font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      border: 1px solid transparent;
      border-radius: var(--oj-radius);
      padding: 0.125rem 0.375rem;
    }
    :host(.oj-badge--neutral) {
      color: var(--oj-neutral);
      border-color: var(--oj-neutral);
      background: var(--oj-neutral-bg);
    }
    :host(.oj-badge--success) {
      color: var(--oj-success);
      border-color: var(--oj-success);
      background: var(--oj-success-bg);
    }
    :host(.oj-badge--warning) {
      color: var(--oj-warning);
      border-color: var(--oj-warning);
      background: var(--oj-warning-bg);
    }
    :host(.oj-badge--danger) {
      color: var(--oj-danger);
      border-color: var(--oj-danger);
      background: var(--oj-danger-bg);
    }
    :host(.oj-badge--solid) {
      color: var(--oj-bg);
      border-color: var(--oj-primary);
      background: var(--oj-primary);
    }
  `,
})
export class Badge {
  readonly tone = input<'neutral' | 'success' | 'warning' | 'danger' | 'solid'>('neutral');

  protected readonly toneClass = computed(() => `oj-badge--${this.tone()}`);
}
