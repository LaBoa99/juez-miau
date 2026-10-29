import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { EditionStatus, ProblemStatus } from '@concurso/shared-types';
import { Badge } from '../../../../shared/ui/badge.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { Modal } from '../../../../shared/ui/modal.component';
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
    RouterLink,
    RouterOutlet,
    Badge,
    ButtonDirective,
    FormField,
    Alert,
    ConfirmDialog,
    Modal,
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
  protected readonly isScheduled = computed(() => this.edition()?.status === EditionStatus.SCHEDULED);

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

  // Mensaje de éxito tras programar (ISO de la fecha)
  protected readonly scheduledAt = signal<string | null>(null);

  // ─── Editar datos ───
  private readonly editModal = viewChild.required<Modal>('editModal');
  protected readonly editSaving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    durationMin: [0, [Validators.required, Validators.min(1)]],
    freezeMin: [0, [Validators.required, Validators.min(0)]],
  });

  // ─── Programar ───
  private readonly scheduleModal = viewChild.required<Modal>('scheduleModal');
  protected readonly scheduleSaving = signal(false);
  protected readonly scheduleErrorMsg = signal<string | null>(null);
  protected readonly scheduleErrorList = signal<string[]>([]);
  protected readonly minStart = signal('');
  protected readonly scheduleForm = this.fb.nonNullable.group({
    start: ['', [Validators.required]],
  });

  // Requisitos (solo al programar desde DRAFT). null = cargando.
  protected readonly durationOk = computed(() => (this.edition()?.duration_ms ?? 0) > 0);
  protected readonly problemsOk = signal<boolean | null>(null);
  protected readonly teamsOk = signal<boolean | null>(null);
  protected readonly allReqsOk = computed(
    () => this.durationOk() && this.problemsOk() === true && this.teamsOk() === true,
  );
  // En SCHEDULED se reprograma sin lista de requisitos.
  protected readonly canSubmitSchedule = computed(() => !this.isDraft() || this.allReqsOk());

  // ─── Eliminar ───
  private readonly deleteDialog = viewChild.required(ConfirmDialog);

  openEdit(): void {
    const e = this.edition();
    if (!e) return;
    this.scheduledAt.set(null);
    this.editError.set(null);
    this.editForm.reset({
      name: e.name,
      durationMin: msToMin(e.duration_ms),
      freezeMin: msToMin(e.freeze_duration_ms),
    });
    this.editModal().open();
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
          this.editModal().close();
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
    this.scheduledAt.set(null);
    this.scheduleErrorMsg.set(null);
    this.scheduleErrorList.set([]);
    this.minStart.set(this.toLocalInput(new Date()));
    this.scheduleForm.reset({ start: e?.scheduled_start ? this.toLocalInput(e.scheduled_start) : '' });

    // Requisitos solo cuando se programa desde borrador.
    if (this.isDraft()) {
      this.problemsOk.set(null);
      this.teamsOk.set(null);
      this.service.problems(this.id).subscribe({
        next: (ps) => this.problemsOk.set(ps.some((p) => p.status === ProblemStatus.PUBLISHED)),
        error: () => this.problemsOk.set(false),
      });
      this.service.teams(this.id).subscribe({
        next: (ts) => this.teamsOk.set(ts.length > 0),
        error: () => this.teamsOk.set(false),
      });
    }

    this.scheduleModal().open();
  }

  submitSchedule(): void {
    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }
    const raw = this.scheduleForm.getRawValue().start;
    const date = new Date(raw);
    // Validación en cliente: debe ser futura.
    if (isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      this.scheduleErrorMsg.set('La fecha debe ser futura.');
      this.scheduleErrorList.set([]);
      return;
    }

    const iso = date.toISOString();
    this.scheduleSaving.set(true);
    this.scheduleErrorMsg.set(null);
    this.scheduleErrorList.set([]);
    this.service.schedule(this.id, iso).subscribe({
      next: () => {
        this.scheduleSaving.set(false);
        this.scheduleModal().close();
        this.scheduledAt.set(iso);
        this.ctx.reload();
      },
      error: (err) => {
        this.scheduleSaving.set(false);
        // 409 => { message, errors: string[] }
        const body = err?.error;
        this.scheduleErrorMsg.set(
          typeof body?.message === 'string' ? body.message : this.message(err, 'No se pudo programar.'),
        );
        this.scheduleErrorList.set(Array.isArray(body?.errors) ? body.errors : []);
      },
    });
  }

  closeEdit(): void {
    this.editModal().close();
  }

  closeSchedule(): void {
    this.scheduleModal().close();
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
