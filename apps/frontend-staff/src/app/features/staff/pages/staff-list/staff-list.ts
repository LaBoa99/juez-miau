import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IStaffListItem } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { StaffService } from '../../data/staff.service';

@Component({
  selector: 'oj-staff-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    PageHeader,
    ButtonDirective,
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

  protected readonly activeOnlyCtrl = this.fb.nonNullable.control(true);
  protected readonly searchCtrl = this.fb.nonNullable.control('');

  // Alta (formulario inline a la derecha)
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
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

  // Desactivar (confirmación)
  private readonly confirm = viewChild.required(ConfirmDialog);
  protected readonly pendingDeactivate = signal<IStaffListItem | null>(null);

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
      next: () => {
        this.saving.set(false);
        this.form.reset({ name: '', email: '', password: '' });
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
    this.actionError.set(null);
    this.pendingDeactivate.set(user);
    this.confirm().open();
  }

  deactivate(): void {
    const user = this.pendingDeactivate();
    if (!user) return;
    this.service.deactivate(user.id).subscribe({
      next: () => this.load(),
      error: (err) => this.actionError.set(backendMessage(err, 'No se pudo desactivar el usuario.')),
    });
  }
}
