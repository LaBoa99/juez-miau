import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface ToastView {
  id: number;
  title: string;
  detail: string;
  tone: 'danger' | 'warning' | 'neutral';
}

// Pila de avisos fija en la esquina inferior derecha. Solo presentación: el servicio decide
// cuáles se ven y cuándo se cierran.
@Component({
  selector: 'oj-toast-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="oj-toasts" role="status" aria-live="polite">
      @for (t of toasts(); track t.id) {
        <div class="oj-toast" [class]="'oj-toast oj-toast--' + t.tone">
          <p class="oj-toast__text">
            <span class="oj-toast__title">{{ t.title }}</span>
            <span class="oj-toast__sep" aria-hidden="true">·</span>
            <span>{{ t.detail }}</span>
          </p>
          <button type="button" class="oj-toast__close" aria-label="Cerrar aviso" (click)="dismiss.emit(t.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .oj-toasts {
      position: fixed;
      right: var(--oj-space-xl);
      bottom: var(--oj-space-xl);
      z-index: 50;
      display: flex;
      flex-direction: column;
      gap: var(--oj-space-sm);
      width: min(360px, calc(100vw - 2 * var(--oj-space-lg)));
    }
    .oj-toast {
      display: flex;
      align-items: flex-start;
      gap: var(--oj-space-sm);
      padding: var(--oj-space-md);
      border: 1px solid var(--oj-border);
      border-left-width: 4px;
      border-radius: var(--oj-radius);
      background: var(--oj-bg);
      animation: oj-toast-in 160ms ease-out;
    }
    .oj-toast--danger {
      border-left-color: var(--oj-danger);
    }
    .oj-toast--warning {
      border-left-color: var(--oj-warning);
    }
    .oj-toast--neutral {
      border-left-color: var(--oj-neutral);
    }
    .oj-toast__text {
      flex: 1;
      margin: 0;
      font-size: var(--oj-text-body);
      line-height: 1.4;
    }
    .oj-toast__title {
      font-weight: 600;
    }
    .oj-toast__sep {
      margin: 0 var(--oj-space-xs);
      color: var(--oj-text-muted);
    }
    .oj-toast__close {
      flex: none;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: var(--oj-radius);
      background: none;
      color: var(--oj-text-muted);
      font: inherit;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    .oj-toast__close:hover {
      background: var(--oj-bg-muted);
      color: var(--oj-text);
    }
    @keyframes oj-toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .oj-toast {
        animation: none;
      }
    }
  `,
})
export class ToastStack {
  readonly toasts = input.required<readonly ToastView[]>();
  readonly dismiss = output<number>();
}
