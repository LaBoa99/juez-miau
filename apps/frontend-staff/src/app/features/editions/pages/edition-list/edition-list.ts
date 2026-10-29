import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EditionStatus, ICategory, IEditionListItem } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { Badge } from '../../../../shared/ui/badge.component';
import { SidePanel } from '../../../../shared/ui/side-panel.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { EditionStatusPipe } from '../../../../shared/pipes/edition-status.pipe';
import { msToMin, minToMs } from '../../../../shared/time';
import { EditionsService } from '../../data/editions.service';

@Component({
  selector: 'oj-edition-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    Segmented,
    Badge,
    SidePanel,
    FormField,
    EmptyState,
    Alert,
    ButtonDirective,
    EditionStatusPipe,
  ],
  templateUrl: './edition-list.html',
  styleUrl: './edition-list.css',
})
export class EditionList {
  private readonly service = inject(EditionsService);
  private readonly fb = inject(FormBuilder);

  protected readonly msToMin = msToMin;

  readonly editions = signal<IEditionListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly filter = signal<string>('');

  readonly panelOpen = signal(false);
  readonly saving = signal(false);
  readonly createError = signal<string | null>(null);

  readonly filterOptions = [
    { value: '', label: 'Todas' },
    { value: EditionStatus.DRAFT, label: 'Borrador' },
    { value: EditionStatus.SCHEDULED, label: 'Programada' },
    { value: EditionStatus.RUNNING, label: 'En curso' },
    { value: EditionStatus.PAUSED, label: 'Pausada' },
    { value: EditionStatus.FINISHED, label: 'Finalizada' },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    durationMin: [null as number | null, [Validators.required, Validators.min(1)]],
    freezeMin: [0, [Validators.required, Validators.min(0)]],
    blockOnAlert: [false],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list((this.filter() as EditionStatus) || undefined).subscribe({
      next: (editions) => {
        this.editions.set(editions);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  onFilter(value: string): void {
    this.filter.set(value);
    this.load();
  }

  openPanel(): void {
    this.createError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  categoryCodes(categories: ICategory[]): string {
    return categories.map((c) => c.code).join(' · ');
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, durationMin, freezeMin, blockOnAlert } = this.form.getRawValue();
    this.saving.set(true);
    this.createError.set(null);

    this.service
      .create({
        name,
        duration_ms: minToMs(durationMin!),
        freeze_duration_ms: minToMs(freezeMin),
        block_submissions_on_alert: blockOnAlert,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.panelOpen.set(false);
          this.form.reset({ freezeMin: 0, blockOnAlert: false });
          this.filter.set('');
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message;
          this.createError.set(
            Array.isArray(msg) ? msg.join(', ') : (msg ?? 'No se pudo crear la edición.'),
          );
        },
      });
  }
}
