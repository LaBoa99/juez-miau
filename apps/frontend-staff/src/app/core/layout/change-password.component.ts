import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Modal } from '../../shared/ui/modal.component';
import { FormField } from '../../shared/ui/form-field.component';
import { Alert } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../notifications/toast.service';
import { backendMessage } from '../http/backend-error.mapper';

// Cambiar la contraseña propia desde el header. Cierra las demás sesiones; esta sigue abierta.
@Component({
  selector: 'oj-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Modal, FormField, Alert, ButtonDirective],
  template: `
    <oj-modal title="Cambiar mi contraseña" size="sm">
      <form id="change-password-form" [formGroup]="form" (ngSubmit)="submit()" class="oj-cp__form">
        @if (error()) {
          <oj-alert tone="error">{{ error() }}</oj-alert>
        }
        <oj-form-field label="Contraseña actual" for="cp-current">
          <input id="cp-current" type="password" formControlName="currentPassword" autocomplete="current-password" />
        </oj-form-field>
        <oj-form-field label="Contraseña nueva" for="cp-new" hint="Mínimo 8 caracteres.">
          <input id="cp-new" type="password" formControlName="newPassword" autocomplete="new-password" />
        </oj-form-field>
        <oj-form-field label="Repite la contraseña nueva" for="cp-confirm">
          <input id="cp-confirm" type="password" formControlName="confirm" autocomplete="new-password" />
        </oj-form-field>
        <p class="oj-cp__note">Se cerrará tu sesión en los demás equipos.</p>
      </form>
      <div footer>
        <button ojButton variant="secondary" type="button" (click)="modal().close()">Cancelar</button>
        <button ojButton variant="primary" type="submit" form="change-password-form" [disabled]="saving()">
          {{ saving() ? 'Guardando…' : 'Cambiar contraseña' }}
        </button>
      </div>
    </oj-modal>
  `,
  styles: `
    .oj-cp__form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .oj-cp__note {
      margin: 0;
      font-size: 13px;
      color: var(--oj-text-muted);
    }
  `,
})
export class ChangePassword {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly modal = viewChild.required(Modal);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', [Validators.required, Validators.maxLength(128)]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirm: ['', Validators.required],
  });

  open(): void {
    this.form.reset();
    this.error.set(null);
    this.modal().open();
  }

  protected submit(): void {
    const { currentPassword, newPassword, confirm } = this.form.getRawValue();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(newPassword.length > 0 && newPassword.length < 8 ? 'La contraseña nueva debe tener al menos 8 caracteres.' : 'Llena los tres campos.');
      return;
    }
    if (newPassword !== confirm) {
      this.error.set('Las contraseñas nuevas no coinciden.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.auth.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.saving.set(false);
        this.modal().close();
        this.toast.show('Contraseña cambiada', 'Se cerró tu sesión en los demás equipos', 'neutral');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(backendMessage(err, 'No se pudo cambiar la contraseña.'));
      },
    });
  }
}
