import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { EditionStatus } from '@concurso/shared-types';
import { Badge } from '../../../../shared/ui/badge.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { TabNav } from '../../../../shared/ui/tab-nav.component';
import { EditionStatusPipe } from '../../../../shared/pipes/edition-status.pipe';
import { msToMin, minToMs } from '../../../../shared/time';
import { EditionsService } from '../../data/editions.service';
import { EditionContext } from '../edition-layout/edition-context';

@Component({
  selector: 'oj-edition-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterOutlet,
    Badge,
    ButtonDirective,
    FormField,
    Alert,
    ConfirmDialog,
    TabNav,
    EditionStatusPipe,
  ],
  templateUrl: './edition-detail.html',
  styleUrl: './edition-detail.css',
})
export class EditionDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(EditionsService);
  protected readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);

  protected readonly msToMin = msToMin;
  protected readonly edition = this.ctx.edition;
  protected readonly id = Number(this.route.parent?.snapshot.paramMap.get('id'));

  // Reglas del backend: editar/programar solo en DRAFT o SCHEDULED; eliminar solo en DRAFT.
  protected readonly editable = computed(() => {
    const s = this.edition()?.status;
    return s === EditionStatus.DRAFT || s === EditionStatus.SCHEDULED;
  });
  protected readonly isDraft = computed(() => this.edition()?.status === EditionStatus.DRAFT);

  protected readonly tabs = computed(() => {
    const c = this.ctx.counts();
    const base = `/ediciones/${this.id}/configuracion`;
    return [
      { label: 'Categorías', link: `${base}/categorias`, count: c.categorias },
      { label: 'Salones', link: `${base}/salones`, count: c.salones },
      { label: 'Lenguajes', link: `${base}/lenguajes`, count: c.lenguajes },
      { label: 'Staff', link: `${base}/staff`, count: c.staff },
      { label: 'Anti-trampas', link: `${base}/anti-trampas`, count: c.antitrampas },
    ];
  });

  // ─── Editar datos ───
  protected readonly editOpen = signal(false);
  protected readonly editSaving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    durationMin: [0, [Validators.required, Validators.min(1)]],
    freezeMin: [0, [Validators.required, Validators.min(0)]],
  });

  // ─── Programar ───
  protected readonly scheduleOpen = signal(false);
  protected readonly scheduleSaving = signal(false);
  protected readonly scheduleErrors = signal<string[]>([]);
  protected readonly scheduleForm = this.fb.nonNullable.group({
    start: ['', [Validators.required]],
  });

  // ─── Eliminar ───
  private readonly deleteDialog = viewChild.required(ConfirmDialog);

  openEdit(): void {
    const e = this.edition();
    if (!e) return;
    this.scheduleOpen.set(false);
    this.editError.set(null);
    this.editForm.reset({
      name: e.name,
      durationMin: msToMin(e.duration_ms),
      freezeMin: msToMin(e.freeze_duration_ms),
    });
    this.editOpen.set(true);
  }

  submitEdit(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const { name, durationMin, freezeMin } = this.editForm.getRawValue();
    this.editSaving.set(true);
    this.editError.set(null);
    this.service
      .update(this.id, { name, duration_ms: minToMs(durationMin), freeze_duration_ms: minToMs(freezeMin) })
      .subscribe({
        next: () => {
          this.editSaving.set(false);
          this.editOpen.set(false);
          this.ctx.reload();
        },
        error: (err) => {
          this.editSaving.set(false);
          this.editError.set(this.message(err, 'No se pudo guardar.'));
        },
      });
  }

  openSchedule(): void {
    const e = this.edition();
    this.editOpen.set(false);
    this.scheduleErrors.set([]);
    this.scheduleForm.reset({ start: e?.scheduled_start ? this.toLocalInput(e.scheduled_start) : '' });
    this.scheduleOpen.set(true);
  }

  submitSchedule(): void {
    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }
    const iso = new Date(this.scheduleForm.getRawValue().start).toISOString();
    this.scheduleSaving.set(true);
    this.scheduleErrors.set([]);
    this.service.schedule(this.id, iso).subscribe({
      next: () => {
        this.scheduleSaving.set(false);
        this.scheduleOpen.set(false);
        this.ctx.reload();
      },
      error: (err) => {
        this.scheduleSaving.set(false);
        // schedule 409 => { message, errors: string[] }; 400 => { message }
        const body = err?.error;
        this.scheduleErrors.set(
          Array.isArray(body?.errors) ? body.errors : [this.message(err, 'No se pudo programar.')],
        );
      },
    });
  }

  confirmDelete(): void {
    this.deleteDialog().open();
  }

  remove(): void {
    this.service.remove(this.id).subscribe({
      next: () => this.router.navigateByUrl('/ediciones'),
    });
  }

  private message(err: unknown, fallback: string): string {
    const m = (err as { error?: { message?: unknown } })?.error?.message;
    if (Array.isArray(m)) return m.join(', ');
    return typeof m === 'string' ? m : fallback;
  }

  // ISO -> valor para <input type="datetime-local"> en hora local
  private toLocalInput(value: string | Date): string {
    const d = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
