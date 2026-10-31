import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonDirective } from '../../shared/ui/button.directive';

@Component({
  selector: 'oj-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, ButtonDirective],
  template: `
    <header>
      <div class="oj-hd__left">
        <span class="oj-hd__brand">[OJ]</span>
        <nav aria-label="Principal">
          <a class="oj-hd__link" routerLink="/ediciones" routerLinkActive="oj-hd__link--active">Ediciones</a>
          <a class="oj-hd__link" routerLink="/lenguajes" routerLinkActive="oj-hd__link--active">Lenguajes</a>
          <a class="oj-hd__link" routerLink="/staff" routerLinkActive="oj-hd__link--active">Staff</a>
          <a class="oj-hd__link" routerLink="/auditoria" routerLinkActive="oj-hd__link--active">Auditoría</a>
        </nav>
      </div>
      <div class="oj-hd__right">
        <span class="oj-hd__user">{{ userName() }}</span>
        <button ojButton variant="secondary" size="sm" (click)="logout.emit()">Cerrar sesión</button>
      </div>
    </header>
  `,
  styles: `
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--oj-space-md);
      min-height: 48px;
      padding: 0 24px;
      border-bottom: 1px solid var(--oj-border);
    }
    .oj-hd__left,
    .oj-hd__right {
      display: flex;
      align-items: center;
      gap: var(--oj-space-md);
    }
    .oj-hd__brand {
      font-family: var(--oj-font-mono);
      font-size: 15px;
      font-weight: 700;
      color: var(--oj-text);
    }
    nav {
      display: flex;
      gap: var(--oj-space-xs);
    }
    .oj-hd__link {
      padding: 6px 10px;
      border-radius: var(--oj-radius);
      font-size: 13px;
      color: var(--oj-neutral);
    }
    .oj-hd__link,
    .oj-hd__link:hover,
    .oj-hd__link:visited,
    .oj-hd__link:focus {
      text-decoration: none;
    }
    .oj-hd__link--active {
      background: var(--oj-primary);
      color: var(--oj-bg);
    }
    .oj-hd__user {
      font-size: 13px;
      color: var(--oj-text-muted);
    }
  `,
})
export class Header {
  readonly userName = input('Usuario');
  readonly logout = output<void>();
}
