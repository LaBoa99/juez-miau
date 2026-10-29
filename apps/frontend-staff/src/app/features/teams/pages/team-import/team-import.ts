import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ITeamImportCredential, ITeamImportValidation } from '@concurso/shared-types';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Alert } from '../../../../shared/ui/alert.component';
import { FileDrop } from '../../../../shared/ui/file-drop.component';
import { TeamsService } from '../../data/teams.service';

type Step = 'archivo' | 'validacion' | 'credenciales';
const ORDER: Step[] = ['archivo', 'validacion', 'credenciales'];

@Component({
  selector: 'oj-team-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, Alert, FileDrop],
  templateUrl: './team-import.html',
  styleUrl: './team-import.css',
})
export class TeamImport {
  private readonly service = inject(TeamsService);

  readonly editionId = input.required<number>();
  readonly editable = input(true);
  readonly disabledReason = input('');
  readonly imported = output<void>();

  protected readonly step = signal<Step>('archivo');
  protected readonly file = signal<File | null>(null);
  protected readonly validation = signal<ITeamImportValidation | null>(null);
  protected readonly credentials = signal<ITeamImportCredential[]>([]);
  protected readonly createdOk = signal<number | null>(null);

  protected readonly validating = signal(false);
  protected readonly importing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly steps = [
    { key: 'archivo' as const, label: '1 Archivo' },
    { key: 'validacion' as const, label: '2 Validación' },
    { key: 'credenciales' as const, label: '3 Credenciales' },
  ];

  chipState(key: Step): 'actual' | 'hecho' | 'pendiente' {
    const cur = ORDER.indexOf(this.step());
    const i = ORDER.indexOf(key);
    return i === cur ? 'actual' : i < cur ? 'hecho' : 'pendiente';
  }

  protected readonly canImport = computed(() => (this.validation()?.validRows ?? 0) > 0);

  onFile(file: File): void {
    this.file.set(file);
    this.error.set(null);
  }

  validate(): void {
    const file = this.file();
    if (!file) return;
    this.validating.set(true);
    this.error.set(null);
    this.service.validateImport(this.editionId(), file).subscribe({
      next: (res) => {
        this.validating.set(false);
        this.validation.set(res);
        this.step.set('validacion');
      },
      error: (err) => {
        this.validating.set(false);
        this.error.set(message(err, 'No se pudo validar el archivo.'));
      },
    });
  }

  chooseAnother(): void {
    this.file.set(null);
    this.validation.set(null);
    this.error.set(null);
    this.step.set('archivo');
  }

  doImport(): void {
    const file = this.file();
    if (!file) return;
    this.importing.set(true);
    this.error.set(null);
    this.service.import(this.editionId(), file).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.imported.emit();
        if (res.credentials.length > 0) {
          this.credentials.set(res.credentials);
          this.step.set('credenciales');
        } else {
          this.createdOk.set(res.created);
          this.reset();
        }
      },
      error: (err) => {
        this.importing.set(false);
        this.error.set(message(err, 'No se pudo importar el archivo.'));
      },
    });
  }

  done(): void {
    this.credentials.set([]); // se borran de memoria al salir de Credenciales
    this.reset();
  }

  private reset(): void {
    this.file.set(null);
    this.validation.set(null);
    this.step.set('archivo');
  }

  downloadCsv(): void {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Equipo', 'Usuario', 'Password'];
    const lines = [header, ...this.credentials().map((c) => [c.teamName, c.username, c.password])];
    const csv = lines.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'credenciales.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function message(err: unknown, fallback: string): string {
  const m = (err as { error?: { message?: unknown } })?.error?.message;
  if (Array.isArray(m)) return m.join(', ');
  return typeof m === 'string' ? m : fallback;
}
