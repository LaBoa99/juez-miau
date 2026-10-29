import { Injectable, inject, signal } from '@angular/core';
import { map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { ResolveFn } from '@angular/router';
import { IProblemListItem } from '@concurso/shared-types';
import { ProblemsService } from './problems.service';

// Estado compartido entre el workspace (lista), el home (vacío/selección) y el panel (derecha).
// Se provee en ProblemWorkspace, así cada edición abierta tiene el suyo.
@Injectable()
export class ProblemsBus {
  private readonly service = inject(ProblemsService);

  editionId = 0;
  readonly problems = signal<IProblemListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  // El panel la marca cuando su formulario tiene cambios sin guardar.
  readonly dirty = signal(false);

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.editionId).subscribe({
      next: (list) => {
        this.problems.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}

// Migaja de pan del problema: "<letra> · <título>".
export const problemBreadcrumbResolver: ResolveFn<string> = (route) => {
  const id = Number(route.paramMap.get('problemId'));
  return inject(ProblemsService)
    .get(id)
    .pipe(
      map((p) => `${p.letter} · ${p.title}`),
      catchError(() => of('Problema')),
    );
};
