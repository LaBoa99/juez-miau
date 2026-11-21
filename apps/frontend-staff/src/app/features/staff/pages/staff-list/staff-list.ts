import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IStaffListItem } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Icon } from '../../../../shared/ui/icon.component';
import { TooltipDirective } from '../../../../shared/ui/tooltip.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { IStaffCredentials, StaffService } from '../../data/staff.service';
import { downloadCredentialsPdf } from '../../../teams/data/credentials-pdf';

// Indicaciones del PDF de credenciales de staff (los equipos usan TEAM_LOGIN_INSTRUCTIONS).
const STAFF_LOGIN_INSTRUCTIONS: readonly string[] = [
  `Entra al panel de staff en ${location.origin} con el correo y la contraseña de arriba.`,
  'No compartas estas credenciales.',
  'Si pierdes la contraseña, pide al superadmin que te genere una nueva.',
];

@Component({
  selector: 'oj-staff-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    PageHeader,
    ButtonDirective, Icon, TooltipDirective,
    Badge,
    FormField,
    Alert,
    ConfirmDialog,
    EmptyState,
    Modal,
  ],
  templateUrl: './staff-list.html',
  styleUrl: './staff-list.css',
})
export class StaffList {
  private readonly service = inject(StaffService);
  private readonly fb = inject(FormBuilder);

  protected readonly rows = signal<IStaffListItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly actionSuccess = signal<string | null>(null);
  protected readonly pdfWarning = signal<string | null>(null);
  protected readonly pdfBusy = signal<number | 'all' | null>(null);

  protected readonly activeOnlyCtrl = this.fb.nonNullable.control(true);
  protected readonly searchCtrl = this.fb.nonNullable.control('');

  // Alta (formulario inline a la derecha). La contraseña la genera el backend, como a los equipos.
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });

  // Edición (modal). La contraseña es opcional: vacía = no cambiarla.
  private readonly editModal = viewChild.required(Modal);
  private editingId: number | null = null;
  protected readonly editSaving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.minLength(8), Validators.maxLength(128)]],
  });

  // Confirmación compartida (desactivar y nueva contraseña)
  private readonly confirm = viewChild.required(ConfirmDialog);
  protected readonly pendingConfirm = signal<{ title: string; message: string; label: string; danger: boolean; run: () => void } | null>(null);

  constructor() {
    this.load();
    this.activeOnlyCtrl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.load());
    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.activeOnlyCtrl.value, this.searchCtrl.value).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    this.service.create(this.form.getRawValue()).subscribe({
      next: (user) => {
        this.saving.set(false);
        this.form.reset({ name: '', email: '' });
        this.actionSuccess.set(`Se agregó a ${user.name}. Descarga su PDF para entregarle la contraseña.`);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(backendMessage(err, 'No se pudo crear el usuario.'));
      },
    });
  }

  openEdit(user: IStaffListItem): void {
    this.editingId = user.id;
    this.editError.set(null);
    this.editForm.reset({ name: user.name, email: user.email, password: '' });
    this.editModal().open();
  }

  submitEdit(): void {
    if (this.editForm.invalid || this.editingId == null) {
      this.editForm.markAllAsTouched();
      return;
    }
    const { name, email, password } = this.editForm.getRawValue();
    this.editSaving.set(true);
    this.editError.set(null);
    this.service.update(this.editingId, { name, email, ...(password ? { password } : {}) }).subscribe({
      next: () => {
        this.editSaving.set(false);
        this.editModal().close();
        this.load();
      },
      error: (err) => {
        this.editSaving.set(false);
        this.editError.set(backendMessage(err, 'No se pudo guardar.'));
      },
    });
  }

  closeEdit(): void {
    this.editModal().close();
  }

  askDeactivate(user: IStaffListItem): void {
    this.openConfirm('Desactivar usuario', `¿Desactivar a ${user.name}? Ya no podrá iniciar sesión.`, 'Desactivar', true, () =>
      this.service.deactivate(user.id).subscribe({
        next: () => this.load(),
        error: (err) => this.actionError.set(backendMessage(err, 'No se pudo desactivar el usuario.')),
      }),
    );
  }

  askReset(user: IStaffListItem): void {
    this.openConfirm(
      'Nueva contraseña',
      `¿Generar una nueva contraseña para ${user.name}? La actual dejará de funcionar y se cerrarán sus sesiones.`,
      'Generar',
      false,
      () =>
        this.service.resetPassword(user.id).subscribe({
          next: () => this.actionSuccess.set(`Se generó una nueva contraseña para ${user.name}. Descarga su PDF.`),
          error: (err) => this.actionError.set(backendMessage(err, 'No se pudo generar la contraseña.')),
        }),
    );
  }

  runConfirm(): void {
    this.pendingConfirm()?.run();
  }

  private openConfirm(title: string, message: string, label: string, danger: boolean, run: () => void): void {
    this.clearMessages();
    this.pendingConfirm.set({ title, message, label, danger, run });
    this.confirm().open();
  }

  // ─── PDF de credenciales ───
  downloadOne(user: IStaffListItem): void {
    this.clearMessages();
    this.pdfBusy.set(user.id);
    // La contraseña se pide aquí y se usa solo para el PDF; nunca se guarda en el estado.
    this.service.getCredentials(user.id).subscribe({
      next: (cred) => {
        if (cred.password === null) {
          this.pdfBusy.set(null);
          this.actionError.set(`${user.name} no tiene una contraseña recuperable. Genérale una nueva para descargar su PDF.`);
          return;
        }
        this.makePdf([cred], `credenciales-${slug(user.name)}.pdf`);
      },
      error: (err) => {
        this.pdfBusy.set(null);
        this.actionError.set(backendMessage(err, 'No se pudo descargar el PDF.'));
      },
    });
  }

  // Todos los de la lista (mismos filtros) en un solo PDF, uno por página.
  downloadAll(): void {
    this.clearMessages();
    this.pdfBusy.set('all');
    this.service.getAllCredentials(this.activeOnlyCtrl.value, this.searchCtrl.value).subscribe({
      next: (creds) => {
        const usable = creds.filter((c) => c.password !== null);
        const skipped = creds.filter((c) => c.password === null).map((c) => c.name);
        if (skipped.length) {
          this.pdfWarning.set(
            `Sin contraseña recuperable (no salen en el PDF; genérales una nueva): ${skipped.join(', ')}.`,
          );
        }
        if (usable.length === 0) {
          this.pdfBusy.set(null);
          this.actionError.set('No hay usuarios con contraseña recuperable para descargar.');
          return;
        }
        this.makePdf(usable, 'credenciales-staff.pdf');
      },
      error: (err) => {
        this.pdfBusy.set(null);
        this.actionError.set(backendMessage(err, 'No se pudo descargar el PDF.'));
      },
    });
  }

  private makePdf(creds: IStaffCredentials[], fileName: string): void {
    downloadCredentialsPdf(
      creds.map((c) => ({ teamName: c.name, username: c.email, password: c.password ?? '' })),
      fileName,
      STAFF_LOGIN_INSTRUCTIONS,
    )
      .then(({ logoMissing }) => {
        this.pdfBusy.set(null);
        if (logoMissing) {
          this.pdfWarning.set('No se encontró el logo (logo-cuvalles.png); el PDF se generó solo con el texto del encabezado.');
        }
      })
      .catch(() => {
        this.pdfBusy.set(null);
        this.actionError.set('No se pudo generar el PDF.');
      });
  }

  private clearMessages(): void {
    this.actionError.set(null);
    this.actionSuccess.set(null);
    this.pdfWarning.set(null);
  }
}

// Nombre de archivo seguro a partir del nombre del usuario.
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'staff'
  );
}
