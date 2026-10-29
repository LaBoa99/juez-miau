import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ICategory } from '@concurso/shared-types';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { FormField } from '../../../shared/ui/form-field.component';
import { Alert } from '../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { EmptyState } from '../../../shared/ui/empty-state.component';
import { CategoriesService } from './data/categories.service';
import { EditionContext } from '../pages/edition-layout/edition-context';
import { findEditionId, message } from '../tab-utils';

@Component({
  selector: 'oj-categories-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonDirective, FormField, Alert, ConfirmDialog, EmptyState],
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
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly editingId = signal<number | null>(null);

  protected readonly form = this.fb.nonNullable.group({
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

  startEdit(cat: ICategory): void {
    this.editingId.set(cat.id);
    this.formError.set(null);
    this.form.reset({ code: cat.code, name: cat.name });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ code: '', name: '' });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const dto = this.form.getRawValue();
    const id = this.editingId();
    this.saving.set(true);
    this.formError.set(null);
    const req = id ? this.service.update(id, dto) : this.service.create(this.editionId, dto);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(message(err, 'No se pudo guardar.'));
      },
    });
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
