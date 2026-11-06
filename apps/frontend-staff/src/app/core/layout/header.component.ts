import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { RealtimeService } from '../realtime/realtime.service';
import { AuthService } from '../auth/auth.service';
import { LiveClockService } from '../realtime/live-clock.service';
import { ContestCountdown } from '../../shared/ui/contest-countdown.component';
import { EditionStatus } from '@concurso/shared-types';

@Component({
  selector: 'oj-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, ButtonDirective, ContestCountdown],
  template: `
    <header>
      <div class="oj-hd__left">
        <img class="oj-hd__brand" src="assets/logos/gatito.svg" alt="Juez Virtual" />
        <nav aria-label="Principal">
          <a class="oj-hd__link" routerLink="/ediciones" routerLinkActive="oj-hd__link--active">Ediciones</a>
          <a class="oj-hd__link" routerLink="/lenguajes" routerLinkActive="oj-hd__link--active">Lenguajes</a>
          @if (auth.isSuperadmin()) {
            <a class="oj-hd__link" routerLink="/staff" routerLinkActive="oj-hd__link--active">Staff</a>
            <a class="oj-hd__link" routerLink="/auditoria" routerLinkActive="oj-hd__link--active">Auditoría</a>
          }
          <a class="oj-hd__link" routerLink="/tutoriales" routerLinkActive="oj-hd__link--active">Tutoriales</a>
          <a class="oj-hd__link" routerLink="/creditos" routerLinkActive="oj-hd__link--active">Créditos</a>
        </nav>
      </div>
      <div class="oj-hd__right">
        <span class="oj-hd__user">{{ userName() }}</span>
        @if (rt.active()) {
          <span class="oj-hd__live" [class]="'oj-hd__live--' + live().tone" role="status">
            <span class="oj-hd__dot" aria-hidden="true"></span>
            {{ live().label }}
          </span>
        }
        @if (runningClock(); as c) {
          <oj-contest-countdown variant="compact" [clock]="c" />
        }
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
      display: block;
      width: 28px;
      height: 28px;
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
    .oj-hd__live {
      display: inline-flex;
      align-items: center;
      gap: var(--oj-space-xs);
      font-size: 12px;
    }
    .oj-hd__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .oj-hd__live--live {
      color: var(--oj-success);
    }
    .oj-hd__live--reconnecting {
      color: var(--oj-warning);
    }
    .oj-hd__live--off {
      color: var(--oj-text-muted);
    }
  `,
})
export class Header {
  protected readonly rt = inject(RealtimeService);
  protected readonly auth = inject(AuthService);
  private readonly liveClock = inject(LiveClockService);
  readonly userName = input('Usuario');

  // Tiempo restante junto a "En vivo" solo mientras el concurso corre o está en pausa
  protected readonly runningClock = computed(() => {
    const c = this.liveClock.clock();
    return this.rt.active() && (c?.status === EditionStatus.RUNNING || c?.status === EditionStatus.PAUSED) ? c : null;
  });
  readonly logout = output<void>();

  protected readonly live = computed(() => {
    switch (this.rt.connectionState()) {
      case 'connected':
        return { tone: 'live', label: 'En vivo' };
      case 'connecting':
        return { tone: 'reconnecting', label: 'Reconectando…' };
      default:
        return { tone: 'off', label: 'Sin conexión' };
    }
  });
}
