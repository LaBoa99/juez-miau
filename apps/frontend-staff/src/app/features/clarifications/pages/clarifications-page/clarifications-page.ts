import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IStaffClarification } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ProblemsService } from '../../../problems/data/problems.service';
import { ClarificationsService } from '../../data/clarifications.service';

type Tab = 'pending' | 'answered';

@Component({
  selector: 'oj-clarifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, PageHeader, ButtonDirective, Badge, Alert, EmptyState, Segmented, FormField, Modal, ConfirmDialog],
  templateUrl: './clarifications-page.html',
  styleUrl: './clarifications-page.css',
})
export class ClarificationsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ClarificationsService);
  private readonly problems = inject(ProblemsService);
  private readonly rt = inject(RealtimeService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = findEditionId(this.route);

  // Lista maestra (más reciente primero); la pestaña filtra en el cliente.
  protected readonly all = signal<IStaffClarification[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  private readonly problemLabels = signal<Map<number, string>>(new Map());

  protected readonly tab = signal<Tab>('pending');
  protected readonly pendingCount = computed(() => this.all().filter(isOpen).length);
  protected readonly tabOptions = computed(() => [
    { value: 'pending', label: `Sin responder (${this.pendingCount()})` },
    { value: 'answered', label: 'Respondidas' },
  ]);
  protected readonly filtered = computed(() => {
    const pending = this.tab() === 'pending';
    return this.all().filter((c) => isOpen(c) === pending);
  });

  // Modal de respuesta (sirve también para corregir una ya publicada).
  private readonly answerModal = viewChild.required<Modal>('answerModal');
  protected readonly target = signal<IStaffClarification | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly answerCtrl = this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(2000)]);

  constructor() {
    this.load();
    this.problems.list(this.editionId).subscribe({
      next: (rows) => this.problemLabels.set(new Map(rows.map((p) => [p.id, `${p.letter} · ${p.title}`]))),
      error: () => {},
    });

    this.rt.joinEdition(this.editionId);
    this.rt
      .onClarification()
      .pipe(takeUntilDestroyed())
      .subscribe((c) => this.upsert(c));
    this.rt
      .onClarificationDelete()
      .pipe(takeUntilDestroyed())
      .subscribe(({ id }) => this.all.set(this.all().filter((c) => c.id !== id)));
    this.destroyRef.onDestroy(() => this.rt.leave(this.editionId));
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.editionId).subscribe({
      next: (rows) => {
        this.all.set([...rows].sort((a, b) => b.id - a.id));
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private upsert(c: IStaffClarification): void {
    const list = this.all();
    const idx = list.findIndex((x) => x.id === c.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = c;
      this.all.set(next);
    } else {
      this.all.set([c, ...list].sort((a, b) => b.id - a.id));
    }
  }

  onTab(value: string): void {
    this.tab.set(value as Tab);
  }

  openAnswer(c: IStaffClarification): void {
    this.target.set(c);
    this.answerCtrl.reset(c.answer ?? '');
    this.submitted.set(false);
    this.saveError.set(null);
    this.answerModal().open();
  }

  protected answerInvalid(): boolean {
    return this.submitted() && this.answerCtrl.invalid;
  }

  save(): void {
    const c = this.target();
    this.submitted.set(true);
    if (!c || this.answerCtrl.invalid || !this.answerCtrl.value.trim()) {
      this.answerCtrl.setErrors({ required: true });
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.service.answer(this.editionId, c.id, this.answerCtrl.value.trim()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.upsert(updated);
        this.answerModal().close();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(backendMessage(err, 'No se pudo publicar la respuesta.'));
      },
    });
  }

  // ─── Rechazar / eliminar ───
  private readonly rejectDialog = viewChild.required<ConfirmDialog>('rejectDlg');
  private readonly deleteDialog = viewChild.required<ConfirmDialog>('deleteDlg');
  protected readonly actionError = signal<string | null>(null);
  private pendingAction: IStaffClarification | null = null;

  askReject(c: IStaffClarification): void {
    this.pendingAction = c;
    this.actionError.set(null);
    this.rejectDialog().open();
  }

  askDelete(c: IStaffClarification): void {
    this.pendingAction = c;
    this.actionError.set(null);
    this.deleteDialog().open();
  }

  reject(): void {
    const c = this.pendingAction;
    if (!c) return;
    this.service.reject(this.editionId, c.id).subscribe({
      next: (updated) => this.upsert(updated),
      error: (err) => this.actionError.set(backendMessage(err, 'No se pudo rechazar la aclaración.')),
    });
  }

  remove(): void {
    const c = this.pendingAction;
    if (!c) return;
    this.service.remove(this.editionId, c.id).subscribe({
      next: () => this.all.set(this.all().filter((x) => x.id !== c.id)),
      error: (err) => this.actionError.set(backendMessage(err, 'No se pudo eliminar la aclaración.')),
    });
  }

  problemLabel(c: IStaffClarification): string {
    if (c.problemId == null) return 'General';
    return this.problemLabels().get(c.problemId) ?? `Problema #${c.problemId}`;
  }
}

// Sin responder: ni respondida ni rechazada
function isOpen(c: IStaffClarification): boolean {
  return c.answer == null && c.rejectedAt == null;
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
