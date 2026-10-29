import { Injectable, inject, signal } from '@angular/core';
import { map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { ResolveFn } from '@angular/router';
import { IEditionDetail } from '@concurso/shared-types';
import { EditionsService } from '../../data/editions.service';
import { EditionLanguagesService } from '../../edition-languages/data/edition-languages.service';
import { EditionStaffService } from '../../edition-staff/data/edition-staff.service';

export type TabCounts = {
  categorias?: number;
  salones?: number;
  lenguajes?: number;
  staff?: number;
};

// Edición actual, compartida por el layout y sus páginas hijas. Se provee en el componente
// edition-layout, así cada edición abierta tiene su propia instancia.
@Injectable()
export class EditionContext {
  private readonly editions = inject(EditionsService);
  private readonly languages = inject(EditionLanguagesService);
  private readonly staff = inject(EditionStaffService);

  readonly edition = signal<IEditionDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly counts = signal<TabCounts>({});

  load(id: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.editions.get(id).subscribe({
      next: (e) => {
        this.edition.set(e);
        this.loading.set(false);
        this.counts.update((c) => ({ ...c, categorias: e.categories.length, salones: e.rooms.length }));
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    this.languages.ofEdition(id).subscribe({ next: (l) => this.setCount('lenguajes', l.length), error: () => {} });
    this.staff.list(id).subscribe({ next: (s) => this.setCount('staff', s.length), error: () => {} });
  }

  reload(): void {
    const id = this.edition()?.id;
    if (id) this.load(id);
  }

  setCount(key: keyof TabCounts, n: number): void {
    this.counts.update((c) => ({ ...c, [key]: n }));
  }
}

// Migaja de pan dinámica para el segmento :id. El backend no tiene "código" de edición: usa el nombre.
export const editionBreadcrumbResolver: ResolveFn<string> = (route) => {
  const id = Number(route.paramMap.get('id'));
  return inject(EditionsService)
    .get(id)
    .pipe(
      map((e) => e.name),
      catchError(() => of('Edición #' + id)),
    );
};
