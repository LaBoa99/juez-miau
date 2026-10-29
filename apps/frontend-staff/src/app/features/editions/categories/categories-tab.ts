import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ICategory } from '@concurso/shared-types';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { FormField } from '../../../shared/ui/form-field.component';
import { Alert } from '../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { EmptyState } from '../../../shared/ui/empty-state.component';
import { Modal } from '../../../shared/ui/modal.component';
import { CategoriesService } from './data/categories.service';
import { EditionContext } from '../pages/edition-layout/edition-context';
import { findEditionId, message } from '../tab-utils';

@Component({
  selector: 'oj-categories-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonDirective, FormField, Alert, ConfirmDialog, EmptyState, Modal],
  templateUrl: './categories-tab.html',
  styleUrl: '../tab.css',
})
export class CategoriesTab {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(CategoriesService);
  private readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);

  protected readonly editionId = findEditionId(this.route);

  protected readonly rows = signal<ICategory[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  // Alta (formulario a la derecha de la tabla)
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(255)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
  });

  // Edición (modal)
  private readonly editModal = viewChild.required(Modal);
  private editingId: number | null = null;
  protected readonly editSaving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(255)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
  });

  private readonly dialog = viewChild.required(ConfirmDialog);
  private pendingDelete: ICategory | null = null;

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.editionId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.ctx.setCount('categorias', rows.length);
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
    this.service.create(this.editionId, this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ code: '', name: '' });
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(message(err, 'No se pudo guardar.'));
      },
    });
  }

  openEdit(cat: ICategory): void {
    this.editingId = cat.id;
    this.editError.set(null);
    this.editForm.reset({ code: cat.code, name: cat.name });
    this.editModal().open();
  }

  submitEdit(): void {
    if (this.editForm.invalid || this.editingId == null) {
      this.editForm.markAllAsTouched();
      return;
    }
    this.editSaving.set(true);
    this.editError.set(null);
    this.service.update(this.editingId, this.editForm.getRawValue()).subscribe({
      next: () => {
        this.editSaving.set(false);
        this.editModal().close();
        this.load();
      },
      error: (err) => {
        this.editSaving.set(false);
        this.editError.set(message(err, 'No se pudo guardar.'));
      },
    });
  }

  closeEdit(): void {
    this.editModal().close();
  }

  askDelete(cat: ICategory): void {
    this.pendingDelete = cat;
    this.dialog().open();
  }

  remove(): void {
    const cat = this.pendingDelete;
    if (!cat) return;
    this.service.remove(cat.id).subscribe({
      next: () => this.load(),
      error: (err) => this.formError.set(message(err, 'No se pudo eliminar.')),
    });
  }
}
