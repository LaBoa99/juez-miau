import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EditionStatus, ICategory, IEditionListItem } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { Badge } from '../../../../shared/ui/badge.component';
import { SidePanel } from '../../../../shared/ui/side-panel.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { DurationInput } from '../../../../shared/ui/duration-input.component';
import { EditionStatusPipe } from '../../../../shared/pipes/edition-status.pipe';
import { formatDuration, minToMs } from '../../../../shared/time';
import { EditionsService } from '../../data/editions.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { backendMessage } from '../../../../core/http/backend-error.mapper';

const STATUS_ORDER: EditionStatus[] = [
  EditionStatus.RUNNING,
  EditionStatus.PAUSED,
  EditionStatus.SCHEDULED,
  EditionStatus.DRAFT,
  EditionStatus.FINISHED,
];

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
    ConfirmDialog,
    DurationInput,
    EditionStatusPipe,
  ],
  templateUrl: './edition-list.html',
  styleUrl: './edition-list.css',
})
export class EditionList {
  private readonly service = inject(EditionsService);
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly formatDuration = formatDuration;
  protected readonly FINISHED = EditionStatus.FINISHED;

  // Recién creada: se pregunta si se configura ya (categorías, salones, lenguajes y staff)
  private readonly configureDialog = viewChild.required(ConfirmDialog);
  protected readonly created = signal<{ id: number; name: string } | null>(null);

  readonly editions = signal<IEditionListItem[]>([]);
  // Primero las que están en juego y al final las finalizadas; dentro de cada estado, la más reciente
  // primero (el backend ya las manda por id descendente y sort es estable)
  readonly sorted = computed(() =>
    [...this.editions()].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)),
  );
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

  // Vuelve a pedir /auth/me (los roles nuevos) y la lista: por si el superadmin ya lo asignó
  recheck(): void {
    this.auth.me().subscribe({ next: () => this.load(), error: () => this.load() });
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

  configureCreated(): void {
    const created = this.created();
    if (created) this.router.navigate(['/ediciones', created.id]);
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
        next: (edition) => {
          this.saving.set(false);
          this.panelOpen.set(false);
          this.form.reset({ freezeMin: 0, blockOnAlert: false });
          this.filter.set('');
          this.load();
          this.created.set({ id: edition.id, name: edition.name });
          this.configureDialog().open();
        },
        error: (err) => {
          this.saving.set(false);
          this.createError.set(backendMessage(err, 'No se pudo crear la edición.'));
        },
      });
  }
}
