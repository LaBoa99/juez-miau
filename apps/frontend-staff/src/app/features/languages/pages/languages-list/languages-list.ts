import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ICreateLanguage, ILanguage } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { EditionLanguagesService } from '../../../editions/edition-languages/data/edition-languages.service';

@Component({
  selector: 'oj-languages-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageHeader, ButtonDirective, Badge, FormField, Alert, EmptyState, Modal],
  templateUrl: './languages-list.html',
  styleUrl: './languages-list.css',
})
export class LanguagesList {
  private readonly service = inject(EditionLanguagesService);
  private readonly fb = inject(FormBuilder);

  protected readonly rows = signal<ILanguage[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  // Alta (formulario inline a la derecha)
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(100)]],
    file_ext: ['', [Validators.required, Validators.pattern(/^[a-z0-9]{1,4}$/)]],
    compiler_version: ['', [Validators.required]],
    image_ref: ['', [Validators.required]],
    compile_cmd: ['', [Validators.required]],
    run_cmd: ['', [Validators.required]],
    flags: [''],
    time_multiplier: [1, [Validators.required, Validators.min(0.01), Validators.max(99.99)]],
    active: [true],
  });

  // "Editar" (modal): el backend solo alterna `active`; los comandos no se editan.
  private readonly editModal = viewChild.required(Modal);
  protected readonly selected = signal<ILanguage | null>(null);
  protected readonly toggleSaving = signal(false);
  protected readonly toggleError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.catalog().subscribe({
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
    const raw = this.form.getRawValue();
    const dto: ICreateLanguage = {
      code: raw.code,
      file_ext: raw.file_ext,
      compiler_version: raw.compiler_version,
      image_ref: raw.image_ref,
      compile_cmd: raw.compile_cmd,
      run_cmd: raw.run_cmd,
      time_multiplier: raw.time_multiplier,
      active: raw.active,
      ...(raw.flags.trim() ? { flags: raw.flags.trim() } : {}),
    };
    this.saving.set(true);
    this.formError.set(null);
    this.service.create(dto).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ time_multiplier: 1, active: true, code: '', file_ext: '', compiler_version: '', image_ref: '', compile_cmd: '', run_cmd: '', flags: '' });
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(backendMessage(err, 'No se pudo crear el lenguaje.'));
      },
    });
  }

  openEdit(lang: ILanguage): void {
    this.selected.set(lang);
    this.toggleError.set(null);
    this.editModal().open();
  }

  closeEdit(): void {
    this.editModal().close();
  }

  toggleActive(): void {
    const lang = this.selected();
    if (!lang) return;
    this.toggleSaving.set(true);
    this.toggleError.set(null);
    this.service.toggleActive(lang.id).subscribe({
      next: () => {
        this.toggleSaving.set(false);
        this.editModal().close();
        this.load();
      },
      error: (err) => {
        this.toggleSaving.set(false);
        this.toggleError.set(backendMessage(err, 'No se pudo cambiar el estado del lenguaje.'));
      },
    });
  }
}
