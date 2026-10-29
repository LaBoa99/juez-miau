import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'oj-tab-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav>
      @for (item of items(); track item.link) {
        <a class="oj-tab" [routerLink]="item.link" routerLinkActive="oj-tab--active">
          {{ item.label }}
          @if (item.count != null) {
            <span class="oj-tab__count">{{ item.count }}</span>
          }
        </a>
      }
    </nav>
  `,
  styles: `
    nav {
      display: flex;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--oj-border);
    }
    .oj-tab {
      display: inline-flex;
      align-items: center;
      gap: var(--oj-space-xs);
      padding: var(--oj-space-sm) var(--oj-space-md);
      margin-bottom: -1px;
      border-bottom: 2px solid transparent;
      font-size: 13px;
      font-weight: 500;
      color: var(--oj-neutral);
      text-decoration: none;
    }
    .oj-tab--active {
      font-weight: 600;
      color: var(--oj-text);
      border-bottom-color: var(--oj-text);
    }
    .oj-tab__count {
      font-family: var(--oj-font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      color: var(--oj-text-muted);
    }
  `,
})
export class TabNav {
  readonly items = input<{ label: string; link: string; count?: number }[]>([]);
}
