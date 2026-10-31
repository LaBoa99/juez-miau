import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ICategory, IProblemListItem, ProblemStatus } from '@concurso/shared-types';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { ProblemsBus } from '../../data/problems-bus';

interface Group {
  category: ICategory;
  problems: IProblemListItem[];
}

@Component({
  selector: 'oj-problem-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ButtonDirective, Badge, ConfirmDialog],
  providers: [ProblemsBus],
  templateUrl: './problem-workspace.html',
  styleUrl: './problem-workspace.css',
})
export class ProblemWorkspace {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly ctx = inject(EditionContext);
  protected readonly bus = inject(ProblemsBus);

  private readonly editionId = findEditionId(this.route);
  protected readonly code = computed(() => this.ctx.edition()?.name ?? '');

  // Segmento seleccionado (:problemId o 'nuevo'), leído de la URL —nunca de firstChild/snapshot,
  // que al activarse la ruta pueden no existir todavía (el snapshot del hijo llega undefined).
  protected readonly selected = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.selectedSegment()),
    ),
    { initialValue: this.selectedSegment() },
  );

  protected readonly groups = computed<Group[]>(() => {
    const cats = [...(this.ctx.edition()?.categories ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const problems = this.bus.problems();
    return cats.map((category) => ({
      category,
      problems: problems
        .filter((p) => p.categoryId === category.id)
        .sort((a, b) => a.letter.localeCompare(b.letter)),
    }));
  });

  private readonly confirm = viewChild.required(ConfirmDialog);
  private pendingPath: string | null = null;

  constructor() {
    this.bus.editionId = this.editionId;
    this.bus.load();
  }

  statusLabel(status: ProblemStatus): string {
    return status === ProblemStatus.PUBLISHED ? 'Publicado' : 'Borrador';
  }

  statusTone(status: ProblemStatus): 'success' | 'neutral' {
    return status === ProblemStatus.PUBLISHED ? 'success' : 'neutral';
  }

  selectProblem(id: number): void {
    this.go(String(id));
  }

  selectNew(): void {
    this.go('nuevo');
  }

  private go(path: string): void {
    if (this.bus.dirty()) {
      this.pendingPath = path;
      this.confirm().open();
      return;
    }
    this.navigate(path);
  }

  discardAndContinue(): void {
    this.bus.dirty.set(false);
    if (this.pendingPath) this.navigate(this.pendingPath);
    this.pendingPath = null;
  }

  private navigate(path: string): void {
    this.router.navigate([path], { relativeTo: this.route });
  }

  // Último segmento bajo 'problemas' en la URL actual: ':problemId' o 'nuevo'; null en la lista.
  private selectedSegment(): string | null {
    const match = /\/problemas\/([^/?#]+)/.exec(this.router.url);
    return match ? match[1] : null;
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
