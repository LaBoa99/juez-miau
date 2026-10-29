import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'oj-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <nav aria-label="Breadcrumb">
      @for (item of items(); track $index; let last = $last) {
        @if (last || !item.link) {
          <span class="oj-bc__item oj-bc__current" [attr.aria-current]="last ? 'page' : null">{{ item.label }}</span>
        } @else {
          <a class="oj-bc__item oj-bc__link" [routerLink]="item.link">{{ item.label }}</a>
        }
        @if (!last) {
          <span class="oj-bc__sep" aria-hidden="true">/</span>
        }
      }
    </nav>
  `,
  styles: `
    nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--oj-space-xs);
      font-size: 13px;
    }
    .oj-bc__item {
      color: var(--oj-text-muted);
      text-decoration: none;
    }
    .oj-bc__link:hover {
      text-decoration: underline;
    }
    .oj-bc__current {
      color: var(--oj-text);
    }
    .oj-bc__sep {
      color: var(--oj-text-muted);
    }
  `,
})
export class Breadcrumb {
  readonly items = input<{ label: string; link?: string }[]>([]);
}
