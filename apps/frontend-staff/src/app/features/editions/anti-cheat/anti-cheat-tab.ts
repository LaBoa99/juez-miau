import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EditionStatus } from '@concurso/shared-types';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { Alert } from '../../../shared/ui/alert.component';
import { EditionsService } from '../data/editions.service';
import { EditionContext } from '../pages/edition-layout/edition-context';
import { findEditionId, message } from '../tab-utils';
import {
  FORBIDDEN_PROCESS_CATALOG,
  matchForbidden,
  normalizeProcessName,
} from './forbidden-processes.catalog';

@Component({
  selector: 'oj-anti-cheat-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, Alert],
  templateUrl: './anti-cheat-tab.html',
  styleUrl: './anti-cheat-tab.css',
})
export class AntiCheatTab {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(EditionsService);
  private readonly ctx = inject(EditionContext);

  protected readonly editionId = findEditionId(this.route);
  protected readonly catalog = FORBIDDEN_PROCESS_CATALOG;

  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly otros = signal<string[]>([]);
  protected readonly blockOnAlert = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly editable = computed(() => {
    const s = this.ctx.edition()?.status;
    return s === EditionStatus.DRAFT || s === EditionStatus.SCHEDULED;
  });
  protected readonly count = computed(() => this.selected().size + this.otros().length);

  private inited = false;

  constructor() {
    // Carga inicial desde la edición (una vez que llega).
    effect(() => {
      const e = this.ctx.edition();
      if (e && !this.inited) {
        this.inited = true;
        const { selected, otros } = matchForbidden(e.forbidden_processes);
        this.selected.set(selected);
        this.otros.set(otros);
        this.blockOnAlert.set(e.block_submissions_on_alert);
      }
    });
  }

  procesosDe(ids: string[]): string {
    return ids.join(', ');
  }

  toggleOption(id: string, checked: boolean): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  addOtro(value: string): void {
    const v = value.trim();
    if (!v) return;
    const n = normalizeProcessName(v);
    if (this.otros().some((o) => normalizeProcessName(o) === n)) return;
    this.otros.update((list) => [...list, v]);
  }

  removeOtro(value: string): void {
    this.otros.update((list) => list.filter((x) => x !== value));
  }

  save(): void {
    this.saving.set(true);
    this.saveError.set(null);

    // Unión de los procesos de las opciones marcadas + "Otros", sin duplicados (por forma normalizada).
    const raws: string[] = [];
    for (const group of this.catalog) {
      for (const opt of group.opciones) {
        if (this.selected().has(opt.id)) raws.push(...opt.procesos);
      }
    }
    raws.push(...this.otros());

    const seen = new Set<string>();
    const forbidden: string[] = [];
    for (const r of raws) {
      const n = normalizeProcessName(r);
      if (n && !seen.has(n)) {
        seen.add(n);
        forbidden.push(r);
      }
    }

    this.service
      .update(this.editionId, {
        forbidden_processes: forbidden,
        block_submissions_on_alert: this.blockOnAlert(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.ctx.setCount('antitrampas', this.count());
          this.ctx.reload();
        },
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(message(err, 'No se pudo guardar.'));
        },
      });
  }
}
