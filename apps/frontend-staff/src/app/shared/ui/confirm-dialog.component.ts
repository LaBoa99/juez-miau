import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ButtonDirective } from './button.directive';

@Component({
  selector: 'oj-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective],
  template: `
    <dialog #dlg class="oj-cd" (cancel)="cancelled.emit()">
      <h2 class="oj-cd__title">{{ title() }}</h2>
      <p class="oj-cd__message">{{ message() }}</p>
      <div class="oj-cd__actions">
        <button ojButton variant="secondary" (click)="cancel()">Cancelar</button>
        <button ojButton [variant]="danger() ? 'danger' : 'primary'" (click)="confirm()">
          {{ confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    .oj-cd {
      min-width: 320px;
      max-width: 90vw;
      padding: var(--oj-space-lg);
      background: var(--oj-bg);
      color: var(--oj-text);
      border: 1px solid var(--oj-text);
      border-radius: var(--oj-radius);
      box-shadow: none;
    }
    .oj-cd::backdrop {
      background: var(--oj-backdrop);
    }
    .oj-cd__title {
      margin: 0 0 var(--oj-space-sm);
      font-size: 15px;
      font-weight: 600;
    }
    .oj-cd__message {
      margin: 0 0 var(--oj-space-lg);
      font-size: 13px;
      color: var(--oj-text-muted);
    }
    .oj-cd__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--oj-space-sm);
    }
  `,
})
export class ConfirmDialog {
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  readonly title = input<string>();
  readonly message = input<string>();
  readonly confirmLabel = input('Eliminar');
  readonly danger = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  open() {
    this.dlg().nativeElement.showModal();
  }

  protected confirm() {
    this.dlg().nativeElement.close();
    this.confirmed.emit();
  }

  protected cancel() {
    this.dlg().nativeElement.close();
    this.cancelled.emit();
  }
}
