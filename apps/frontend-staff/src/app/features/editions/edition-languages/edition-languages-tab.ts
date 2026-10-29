import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ILanguage } from '@concurso/shared-types';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { Alert } from '../../../shared/ui/alert.component';
import { EditionLanguagesService } from './data/edition-languages.service';
import { EditionContext } from '../pages/edition-layout/edition-context';
import { findEditionId, message } from '../tab-utils';

@Component({
  selector: 'oj-edition-languages-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, Alert],
  templateUrl: './edition-languages-tab.html',
  styleUrl: './edition-languages-tab.css',
})
export class EditionLanguagesTab {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(EditionLanguagesService);
  private readonly ctx = inject(EditionContext);

  protected readonly editionId = findEditionId(this.route);

  protected readonly catalog = signal<ILanguage[]>([]);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly enabledCount = computed(() => this.selected().size);
  protected readonly total = computed(() => this.catalog().length);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.catalog().subscribe({
      next: (cat) => {
        this.catalog.set(cat);
        // El GET de la edición no trae id; se cruza por `code`.
        this.service.ofEdition(this.editionId).subscribe({
          next: (ed) => {
            const codes = new Set(ed.map((e) => e.code));
            this.selected.set(new Set(cat.filter((l) => codes.has(l.code)).map((l) => l.id)));
            this.ctx.setCount('lenguajes', codes.size);
            this.loading.set(false);
          },
          error: () => {
            this.error.set(true);
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  toggle(id: string, checked: boolean): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  save(): void {
    this.saving.set(true);
    this.saveError.set(null);
    const ids = [...this.selected()];
    this.service.set(this.editionId, ids).subscribe({
      next: () => {
        this.saving.set(false);
        this.ctx.setCount('lenguajes', ids.length);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(message(err, 'No se pudo guardar la selección.'));
      },
    });
  }
}
