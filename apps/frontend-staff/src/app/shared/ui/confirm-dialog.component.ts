import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { ButtonDirective } from './button.directive';
import { Modal } from './modal.component';

@Component({
  selector: 'oj-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, Modal],
  template: `
    <oj-modal #modal [title]="title()" size="sm" [closeOnBackdrop]="false" (closed)="onClosed()">
      <p class="oj-cd__message">{{ message() }}</p>
      <div footer>
        <button ojButton variant="secondary" (click)="cancel()">Cancelar</button>
        <button ojButton [variant]="danger() ? 'danger' : 'primary'" (click)="confirm()">
          {{ confirmLabel() }}
        </button>
      </div>
    </oj-modal>
  `,
  styles: `
    .oj-cd__message {
      margin: 0;
      font-size: 13px;
      color: var(--oj-text-muted);
    }
  `,
})
export class ConfirmDialog {
  private readonly modal = viewChild.required(Modal);

  readonly title = input<string>();
  readonly message = input<string>();
  readonly confirmLabel = input('Eliminar');
  readonly danger = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private confirming = false;

  open() {
    this.confirming = false;
    this.modal().open();
  }

  protected confirm() {
    this.confirming = true;
    this.modal().close();
  }

  protected cancel() {
    this.modal().close();
  }

  // El cierre llega por confirm(), cancel(), la "×" o Esc. Solo confirm() marca `confirming`.
  protected onClosed() {
    if (this.confirming) {
      this.confirmed.emit();
    } else {
      this.cancelled.emit();
    }
    this.confirming = false;
  }
}
