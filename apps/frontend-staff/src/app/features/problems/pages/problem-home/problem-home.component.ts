import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EditionStatus, IProblemListItem, ProblemStatus, StaffRole } from '@concurso/shared-types';
import { AuthService } from '../../../../core/auth/auth.service';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { ProblemStatusPipe } from '../../../../shared/pipes/problem-status.pipe';
import { Alert } from '../../../../shared/ui/alert.component';
import { Badge } from '../../../../shared/ui/badge.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { ProblemsBus } from '../../data/problems-bus';
import { ProblemsService } from '../../data/problems.service';

type Filter = 'todos' | ProblemStatus;

// Sin problema seleccionado: el admin de la edición revisa aquí qué problemas entran al concurso
@Component({
  selector: 'oj-problem-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, EmptyState, Segmented, Badge, Alert, ProblemStatusPipe],
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

  protected readonly canDecide = computed(() => {
    const status = this.ctx.edition()?.status;
    const admin = this.auth.isSuperadmin() || this.auth.roleInEdition(this.bus.editionId) === StaffRole.ADMIN;
    return admin && (status === EditionStatus.DRAFT || status === EditionStatus.SCHEDULED);
  });

  protected readonly filter = signal<Filter>(ProblemStatus.READY);
  protected readonly filterOptions = [
    { value: ProblemStatus.READY as Filter, label: 'Propuestos' },
    { value: ProblemStatus.PUBLISHED as Filter, label: 'En el concurso' },
    { value: ProblemStatus.DRAFT as Filter, label: 'Borradores' },
    { value: 'todos' as Filter, label: 'Todos' },
  ];

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

  open(p: IProblemListItem): void {
    this.router.navigate([p.id], { relativeTo: this.route });
  }

  nuevo(): void {
    // Relativo a la ruta propia (índice vacío de 'problemas') → 'problemas/nuevo'. Sin usar parent.
    this.router.navigate(['nuevo'], { relativeTo: this.route });
  }
}
