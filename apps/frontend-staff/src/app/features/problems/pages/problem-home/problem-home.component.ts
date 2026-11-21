import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EditionStatus, IProblemListItem, ProblemStatus, StaffRole } from '@concurso/shared-types';
import { AuthService } from '../../../../core/auth/auth.service';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { ProblemStatusPipe } from '../../../../shared/pipes/problem-status.pipe';
import { Alert } from '../../../../shared/ui/alert.component';
import { Badge } from '../../../../shared/ui/badge.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Icon } from '../../../../shared/ui/icon.component';
import { TooltipDirective } from '../../../../shared/ui/tooltip.directive';
import { Modal } from '../../../../shared/ui/modal.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { ProblemsBus } from '../../data/problems-bus';
import { ProblemsService } from '../../data/problems.service';

type Filter = 'todos' | ProblemStatus;

// Sin problema seleccionado (o con "Todos los problemas" de la barra lateral): la tabla de todos los problemas.
// El admin de la edición decide aquí qué entra al concurso; cada quien elimina lo que puede sin entrar al problema
@Component({
  selector: 'oj-problem-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, Icon, TooltipDirective, Modal, FormField, EmptyState, Badge, Alert, ConfirmDialog, ProblemStatusPipe],
  templateUrl: './problem-home.component.html',
  styleUrl: './problem-home.component.css',
})
export class ProblemHome {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly ctx = inject(EditionContext);
  private readonly service = inject(ProblemsService);
  protected readonly bus = inject(ProblemsBus);

  protected readonly isAdmin = computed(
    () => this.auth.isSuperadmin() || this.auth.roleInEdition(this.bus.editionId) === StaffRole.ADMIN,
  );
  protected readonly canDecide = computed(() => {
    const status = this.ctx.edition()?.status;
    return this.isAdmin() && (status === EditionStatus.DRAFT || status === EditionStatus.SCHEDULED || status === EditionStatus.PAUSED);
  });

  protected readonly paused = computed(() => this.ctx.edition()?.status === EditionStatus.PAUSED);

  protected readonly filter = signal<Filter>('todos');
  protected readonly filterOptions = computed(() => {
    const count = (status: ProblemStatus) => this.bus.problems().filter((p) => p.status === status).length;
    return [
      { value: 'todos' as Filter, label: `Todos (${this.bus.problems().length})` },
      { value: ProblemStatus.READY as Filter, label: `Propuestos (${count(ProblemStatus.READY)})` },
      { value: ProblemStatus.PUBLISHED as Filter, label: `En el concurso (${count(ProblemStatus.PUBLISHED)})` },
      { value: ProblemStatus.DRAFT as Filter, label: `Borradores (${count(ProblemStatus.DRAFT)})` },
    ];
  });

  private readonly categoryName = computed(() => new Map((this.ctx.edition()?.categories ?? []).map((c) => [c.id, c.name])));
  protected readonly rows = computed(() => {
    const f = this.filter();
    return this.bus.problems().filter((p) => f === 'todos' || p.status === f);
  });

  protected readonly busyId = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  category(p: IProblemListItem): string {
    return this.categoryName().get(p.categoryId) ?? '';
  }

  decide(p: IProblemListItem, action: 'accept' | 'disable'): void {
    this.busyId.set(p.id);
    this.error.set(null);
    this.service[action](p.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.bus.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.error.set(backendMessage(err, action === 'accept' ? `No se pudo aceptar «${p.title}».` : `No se pudo quitar «${p.title}» del concurso.`));
      },
    });
  }

  // ─── Regresar a borrador (con el motivo, que lee su autor) ───
  protected readonly draftModal = viewChild.required(Modal);
  protected readonly draftTarget = signal<IProblemListItem | null>(null);
  protected readonly draftReason = signal('');
  protected readonly draftError = signal<string | null>(null);

  askBackToDraft(p: IProblemListItem): void {
    this.draftTarget.set(p);
    this.draftReason.set('');
    this.draftError.set(null);
    this.draftModal().open();
  }

  backToDraft(): void {
    const p = this.draftTarget();
    const reason = this.draftReason().trim();
    if (!p) return;
    if (!reason) {
      this.draftError.set('Escribe por qué regresa a borrador.');
      return;
    }
    this.busyId.set(p.id);
    this.draftError.set(null);
    this.service.backToDraft(p.id, reason).subscribe({
      next: () => {
        this.busyId.set(null);
        this.draftModal().close();
        this.bus.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.draftError.set(backendMessage(err, `No se pudo regresar «${p.title}» a borrador.`));
      },
    });
  }

  // Mismas reglas que el backend: uno en el concurso solo lo borra el admin antes de iniciar; los demás, su autor o un admin
  canDelete(p: IProblemListItem): boolean {
    if (p.status === ProblemStatus.PUBLISHED) return this.canDecide();
    return this.isAdmin() || p.createdBy === this.auth.user()?.id;
  }

  private readonly deleteDialog = viewChild.required(ConfirmDialog);
  private readonly pendingDelete = signal<IProblemListItem | null>(null);
  protected readonly deleteMessage = computed(() => {
    const p = this.pendingDelete();
    if (!p) return '';
    const inContest = p.status === ProblemStatus.PUBLISHED ? ' Está en el concurso: también sale de él.' : '';
    return `Se eliminará «${p.title}» con su solución y sus casos.${inContest} Esta acción no se puede deshacer.`;
  });

  askDelete(p: IProblemListItem): void {
    this.pendingDelete.set(p);
    this.deleteDialog().open();
  }

  remove(): void {
    const p = this.pendingDelete();
    if (!p) return;
    this.busyId.set(p.id);
    this.error.set(null);
    this.service.remove(p.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.bus.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.error.set(backendMessage(err, `No se pudo eliminar «${p.title}».`));
      },
    });
  }

  open(p: IProblemListItem): void {
    this.router.navigate([p.id], { relativeTo: this.route });
  }

  nuevo(): void {
    // Relativo a la ruta propia (índice vacío de 'problemas') → 'problemas/nuevo'. Sin usar parent.
    this.router.navigate(['nuevo'], { relativeTo: this.route });
  }
}
