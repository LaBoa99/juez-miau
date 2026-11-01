import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { IAuditEntry, IStaffListItem } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { StaffService } from '../../../staff/data/staff.service';
import { AuditService } from '../../data/audit.service';
import { auditResource, auditSummary } from '../../audit-summary';

const PAGE_SIZE = 50;

@Component({
  selector: 'oj-audit-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, PageHeader, ButtonDirective, Badge, Alert, EmptyState, FormField],
  templateUrl: './audit-log.html',
  styleUrl: './audit-log.css',
})
export class AuditLog {
  private readonly service = inject(AuditService);
  private readonly staffService = inject(StaffService);
  private readonly fb = inject(FormBuilder);

  protected readonly rows = signal<IAuditEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  // ¿Hay página más antigua? Se pide un registro de más (PAGE_SIZE + 1) para saberlo.
  protected readonly hasMore = signal(false);
  // `before` aplicados para llegar a la página actual. Vacío = primera página (la más reciente).
  private readonly cursors = signal<number[]>([]);

  // Filtro Persona (el único que el backend soporta de los pedidos). Se aplica al pulsar "Filtrar".
  protected readonly personCtrl = this.fb.control<number | null>(null);
  private readonly staffMap = signal<Map<number, string>>(new Map());
  protected readonly staffOptions = signal<IStaffListItem[]>([]);

  protected readonly rangeStart = computed(() => this.cursors().length * PAGE_SIZE + 1);
  protected readonly rangeEnd = computed(() => this.rangeStart() + this.rows().length - 1);
  protected readonly canPrev = computed(() => this.cursors().length > 0);

  constructor() {
    this.staffService.list(false, '').subscribe({
      next: (staff) => {
        const sorted = [...staff].sort((a, b) => a.name.localeCompare(b.name));
        this.staffOptions.set(sorted);
        this.staffMap.set(new Map(sorted.map((s) => [s.id, s.name])));
      },
      error: () => {},
    });
    this.load(null);
  }

  private load(before: number | null): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list({ staffUserId: this.personCtrl.value, before, limit: PAGE_SIZE + 1 }).subscribe({
      next: (entries) => {
        this.hasMore.set(entries.length > PAGE_SIZE);
        this.rows.set(entries.slice(0, PAGE_SIZE));
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  filter(): void {
    this.cursors.set([]);
    this.load(null);
  }

  next(): void {
    const last = this.rows().at(-1);
    if (!last || !this.hasMore()) return;
    this.cursors.update((c) => [...c, last.id]);
    this.load(last.id);
  }

  prev(): void {
    if (!this.canPrev()) return;
    const c = this.cursors().slice(0, -1);
    this.cursors.set(c);
    this.load(c.at(-1) ?? null);
  }

  personName(id: number): string {
    return this.staffMap().get(id) ?? '#' + id;
  }
  resource(entry: IAuditEntry): string {
    return auditResource(entry);
  }
  summary(entry: IAuditEntry): string {
    return auditSummary(entry);
  }
  actionTone(method: string): 'success' | 'warning' | 'danger' | 'neutral' {
    if (method === 'POST') return 'success';
    if (method === 'PUT' || method === 'PATCH') return 'warning';
    if (method === 'DELETE') return 'danger';
    return 'neutral';
  }
}
