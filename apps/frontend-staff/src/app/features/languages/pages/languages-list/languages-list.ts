import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ICreateLanguage, ILanguage } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { AuthService } from '../../../../core/auth/auth.service';
import { EditionLanguagesService } from '../../../editions/edition-languages/data/edition-languages.service';

@Component({
  selector: 'oj-languages-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageHeader, ButtonDirective, FormField, Alert, EmptyState],
  templateUrl: './languages-list.html',
  styleUrl: './languages-list.css',
})
export class LanguagesList {
  private readonly service = inject(EditionLanguagesService);
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);

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

  // Activar/Desactivar desde la fila: el backend solo alterna `active`.
  protected readonly togglingId = signal<string | null>(null);
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
        this.resetForm();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(backendMessage(err, 'No se pudo crear el lenguaje.'));
      },
    });
  }

  resetForm(): void {
    this.form.reset({ time_multiplier: 1, active: true, code: '', file_ext: '', compiler_version: '', image_ref: '', compile_cmd: '', run_cmd: '', flags: '' });
    this.formError.set(null);
  }

  // Mensaje de error por campo, solo cuando el control es inválido y ya fue tocado.
  protected fieldError(name: keyof typeof this.form.controls): string | undefined {
    const c = this.form.controls[name];
    if (!c.touched || c.valid) return undefined;
    if (c.hasError('required')) return 'Este campo es obligatorio.';
    if (c.hasError('maxlength')) return 'Máximo 100 caracteres.';
    if (c.hasError('pattern')) return 'Solo minúsculas y números (1 a 4 caracteres).';
    if (c.hasError('min') || c.hasError('max')) return 'Debe ser un número entre 0.01 y 99.99.';
    return 'Valor inválido.';
  }

  toggleActive(lang: ILanguage): void {
    this.togglingId.set(lang.id);
    this.toggleError.set(null);
    this.service.toggleActive(lang.id).subscribe({
      next: () => {
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.togglingId.set(null);
        this.toggleError.set(backendMessage(err, 'No se pudo cambiar el estado del lenguaje.'));
      },
    });
  }
}
