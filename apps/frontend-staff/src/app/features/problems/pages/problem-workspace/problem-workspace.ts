import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { catchError, filter, map, of, startWith } from 'rxjs';
import { ICategory, IProblemListItem, ProblemStatus } from '@concurso/shared-types';
import { ProblemStatusPipe } from '../../../../shared/pipes/problem-status.pipe';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { ProblemsBus } from '../../data/problems-bus';
import { EditionStaffService } from '../../../editions/edition-staff/data/edition-staff.service';

interface Group {
  category: ICategory;
  inContest: IProblemListItem[];
  others: IProblemListItem[];
}

// Problemas: la lista (letra y título: se busca por cualquiera de los dos) a la izquierda y el problema abierto o la
// tabla de todos a la derecha. Carga la lista una vez y cuida los cambios sin guardar al cambiar de problema
@Component({
  selector: 'oj-problem-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterOutlet, ConfirmDialog, ProblemStatusPipe],
  providers: [ProblemsBus],
  templateUrl: './problem-workspace.html',
  styleUrl: './problem-workspace.css',
})
export class ProblemWorkspace {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ctx = inject(EditionContext);
  private readonly staff = inject(EditionStaffService);
  protected readonly bus = inject(ProblemsBus);

  private readonly editionId = findEditionId(this.route);

  // Segmento abierto (:problemId o 'nuevo'), leído de la URL; null en la tabla de todos
  protected readonly selected = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.selectedSegment()),
    ),
    { initialValue: this.selectedSegment() },
  );

  // Autores: nombre de cada problema y filtro rápido "los de este juez" (el staff de la edición trae los nombres)
  private readonly staffNames = toSignal(
    this.staff.list(this.editionId).pipe(
      map((rows) => new Map(rows.map((s) => [s.staff_user_id, s.name]))),
      catchError(() => of(new Map<number, string>())), // sin nombres la lista sigue funcionando
    ),
    { initialValue: new Map<number, string>() },
  );
  protected readonly author = signal<number | null>(null);
  protected readonly authors = computed(() => {
    const count = new Map<number, number>();
    for (const p of this.bus.problems()) if (p.createdBy != null) count.set(p.createdBy, (count.get(p.createdBy) ?? 0) + 1);
    return [...count].map(([id, n]) => ({ id, n, name: this.staffNames().get(id) ?? 'Juez #' + id })).sort((a, b) => a.name.localeCompare(b.name));
  });
  authorName(p: IProblemListItem): string {
    return p.createdBy == null ? '' : (this.staffNames().get(p.createdBy) ?? 'Juez #' + p.createdBy);
  }
  setAuthor(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.author.set(value ? Number(value) : null);
  }
  setTab(event: Event): void {
    this.tab.set(Number((event.target as HTMLSelectElement).value));
  }

  protected readonly groups = computed<Group[]>(() => {
    const cats = [...(this.ctx.edition()?.categories ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    return cats.map((category) => {
      const author = this.author();
      const problems = this.bus.problems()
        .filter((p) => p.categoryId === category.id && (author === null || p.createdBy === author))
        // Sin letra hasta que inicia el concurso: entonces en orden de creación
        .sort((a, b) => (a.letter ?? '').localeCompare(b.letter ?? '') || a.id - b.id);
      // Primero los que están en el concurso; abajo, separados y atenuados, los propuestos y borradores
      return {
        category,
        inContest: problems.filter((p) => p.status === ProblemStatus.PUBLISHED),
        others: problems.filter((p) => p.status !== ProblemStatus.PUBLISHED),
      };
    });
  });

  // Pestaña de categoría: filtra la lista para no abarrotarla. Sigue al problema abierto; elegir otra solo cambia la lista
  private readonly selectedCategory = computed(() => this.bus.problems().find((p) => String(p.id) === this.selected())?.categoryId ?? null);
  protected readonly tab = linkedSignal<number | null>(() => this.selectedCategory() ?? this.groups()[0]?.category.id ?? null);
  protected readonly shown = computed(() => this.groups().find((g) => g.category.id === this.tab()) ?? null);

  private readonly confirm = viewChild.required(ConfirmDialog);
  private pending: { path: string; queryParams?: Record<string, string> } | null = null;

  constructor() {
    this.bus.editionId = this.editionId;
    this.bus.navigate = (path, queryParams) => this.go(path, queryParams);
    this.bus.load();
  }

  select(path: string): void {
    this.go(path);
  }

  // Toda navegación entre problemas pasa por aquí: con cambios sin guardar pide confirmar antes de salir
  private go(path: string, queryParams?: Record<string, string>): void {
    if (this.bus.dirty()) {
      this.pending = { path, queryParams };
      this.confirm().open();
      return;
    }
    this.navigate(path, queryParams);
  }

  discardAndContinue(): void {
    this.bus.dirty.set(false);
    if (this.pending) this.navigate(this.pending.path, this.pending.queryParams);
    this.pending = null;
  }

  private navigate(path: string, queryParams?: Record<string, string>): void {
    this.router.navigate([path], { relativeTo: this.route, queryParams });
  }

  private selectedSegment(): string | null {
    const match = /\/problemas\/([^/?#]+)/.exec(this.router.url);
    return match ? match[1] : null;
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
