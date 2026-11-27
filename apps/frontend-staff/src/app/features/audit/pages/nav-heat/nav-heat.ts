import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { merge, switchMap } from 'rxjs';
import { EDITION_SECTIONS, EditionSection, EditionStatus, IEditionListItem, INavCount, NavRole } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { EditionsService } from '../../../editions/data/editions.service';
import { AuditService } from '../../data/audit.service';

const ROLES: { role: NavRole; label: string }[] = [
  { role: 'admin', label: 'Administrador' },
  { role: 'judge', label: 'Juez' },
  { role: 'observer', label: 'Observador' },
  { role: 'superadmin', label: 'Superadmin' },
];

const PHASES: { value: EditionStatus; label: string }[] = [
  { value: EditionStatus.DRAFT, label: 'Borrador' },
  { value: EditionStatus.SCHEDULED, label: 'Programada' },
  { value: EditionStatus.RUNNING, label: 'En curso' },
  { value: EditionStatus.PAUSED, label: 'En pausa' },
  { value: EditionStatus.FINISHED, label: 'Terminada' },
];

const PAIRS_SHOWN = 10;
// A partir de aquí un par se marca como lejano en la barra
const FAR = 3;

// Prueba de calor de la barra de secciones de una edición: qué secciones se abren, con qué rol, y qué saltos se
// repiten. Si una sección muy usada está lejos de las que se usan con ella, el orden no ayuda
@Component({
  selector: 'oj-nav-heat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageHeader, Alert, EmptyState, FormField],
  templateUrl: './nav-heat.html',
  styleUrl: './nav-heat.css',
})
export class NavHeat {
  private readonly audit = inject(AuditService);
  private readonly editions = inject(EditionsService);

  protected readonly roles = ROLES;
  protected readonly phases = PHASES;
  protected readonly sections = EDITION_SECTIONS;
  protected readonly far = FAR;

  protected readonly editionCtrl = new FormControl<number | null>(null);
  protected readonly phaseCtrl = new FormControl<EditionStatus | null>(null);
  protected readonly roleCtrl = new FormControl<NavRole | null>(null);
  private readonly role = toSignal(this.roleCtrl.valueChanges, { initialValue: null });
  protected readonly sessionCtrl = new FormControl<string | null>(null);
  private readonly session = toSignal(this.sessionCtrl.valueChanges, { initialValue: null });

  protected readonly editionList = signal<IEditionListItem[]>([]);
  protected readonly counts = signal<INavCount[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  constructor() {
    this.editions.list().subscribe({ next: (list) => this.editionList.set(list), error: () => {} });
    merge(this.editionCtrl.valueChanges, this.phaseCtrl.valueChanges, [null])
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.error.set(false);
          return this.audit.navCounts(this.editionCtrl.value, this.phaseCtrl.value);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (counts) => {
          this.sessionCtrl.setValue(null);
          this.counts.set(counts);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  // Pestañas (id anónimo por pestaña del panel), de la más activa a la menos; los clics viejos no traen id
  protected readonly sessionList = computed(() => {
    const byId = new Map<string, { count: number; roles: Map<NavRole, number> }>();
    for (const c of this.counts()) {
      if (!c.session) continue;
      const s = byId.get(c.session) ?? { count: 0, roles: new Map() };
      s.count += c.count;
      s.roles.set(c.role, (s.roles.get(c.role) ?? 0) + c.count);
      byId.set(c.session, s);
    }
    return [...byId]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, s], i) => {
        const role = [...s.roles].sort((a, b) => b[1] - a[1])[0][0];
        return { id, count: s.count, label: `Pestaña ${i + 1} · ${ROLES.find((r) => r.role === role)!.label} · ${s.count} clics` };
      });
  });

  // Cuántas pestañas y si una sola concentra los clics (un juez muy activo pesa más que el resto)
  protected readonly sessionSummary = computed(() => {
    const list = this.sessionList();
    if (!list.length) return null;
    const tracked = list.reduce((n, s) => n + s.count, 0);
    return { sessions: list.length, topShare: list[0].count / tracked, untracked: this.counts().reduce((n, c) => n + c.count, 0) - tracked };
  });

  // Todo lo de abajo se calcula con la pestaña elegida (o todas)
  private readonly filtered = computed(() => {
    const session = this.session();
    return session ? this.counts().filter((c) => c.session === session) : this.counts();
  });

  protected readonly total = computed(() => this.filtered().reduce((n, c) => n + c.count, 0));

  // Clics que llegan a cada sección, por rol. % = parte de los clics de ese rol
  protected readonly usage = computed(() => {
    const byRole = new Map<NavRole, number>();
    const cell = new Map<string, number>();
    for (const c of this.filtered()) {
      byRole.set(c.role, (byRole.get(c.role) ?? 0) + c.count);
      cell.set(c.role + '|' + c.to, (cell.get(c.role + '|' + c.to) ?? 0) + c.count);
    }
    const rows = EDITION_SECTIONS.map((s, index) => {
      const cells = ROLES.map(({ role }) => {
        const count = cell.get(role + '|' + s.path) ?? 0;
        const roleTotal = byRole.get(role) ?? 0;
        return { count, share: roleTotal ? count / roleTotal : 0 };
      });
      return { path: s.path, label: s.label, position: index + 1, cells, total: cells.reduce((n, c) => n + c.count, 0) };
    });
    // Lugar por uso (1 = la más abierta): si se aleja mucho de su posición, quizá conviene moverla
    const ranked = [...rows].sort((a, b) => b.total - a.total);
    return rows.map((row) => ({ ...row, rank: row.total ? ranked.indexOf(row) + 1 : null }));
  });

  protected readonly suggestedOrder = computed(() =>
    [...this.usage()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total).map((r) => r.label).join(' · '),
  );

  // Saltos de una sección a otra (con el rol elegido o todos). "Entrada" = el primer clic al abrir la edición
  protected readonly fromRows = computed(() => [{ path: null, label: 'Entrada' }, ...EDITION_SECTIONS] as { path: EditionSection | null; label: string }[]);
  protected readonly jumps = computed(() => {
    const role = this.role();
    const cell = new Map<string, number>();
    for (const c of this.filtered()) {
      if (role && c.role !== role) continue;
      cell.set((c.from ?? '') + '|' + c.to, (cell.get((c.from ?? '') + '|' + c.to) ?? 0) + c.count);
    }
    const max = Math.max(1, ...cell.values());
    return { get: (from: EditionSection | null, to: EditionSection) => cell.get((from ?? '') + '|' + to) ?? 0, max };
  });

  // Distancia media en la barra por salto (posiciones entre una sección y la siguiente): menos es mejor
  protected readonly averageDistance = computed(() => {
    const position = new Map(EDITION_SECTIONS.map((s, i) => [s.path as string, i]));
    let distance = 0;
    let jumps = 0;
    for (const c of this.filtered()) {
      if (c.from === null) continue;
      distance += Math.abs(position.get(c.from)! - position.get(c.to)!) * c.count;
      jumps += c.count;
    }
    return jumps ? (distance / jumps).toFixed(1) : null;
  });

  // Idas y vueltas: A→B y B→A sumados por par (con el rol de la matriz), con su distancia en la barra.
  // Un par muy usado y lejano es candidato a quedar junto
  protected readonly pairs = computed(() => {
    const role = this.role();
    const position = new Map(EDITION_SECTIONS.map((s, i) => [s.path as string, i]));
    const byPair = new Map<string, { a: number; b: number; ab: number; ba: number }>();
    for (const c of this.filtered()) {
      if (c.from === null || (role && c.role !== role)) continue;
      const [a, b] = [position.get(c.from)!, position.get(c.to)!].sort((x, y) => x - y);
      const pair = byPair.get(a + '|' + b) ?? { a, b, ab: 0, ba: 0 };
      if (position.get(c.from) === a) pair.ab += c.count;
      else pair.ba += c.count;
      byPair.set(a + '|' + b, pair);
    }
    const rows = [...byPair.values()].map((p) => ({
      a: EDITION_SECTIONS[p.a].label,
      b: EDITION_SECTIONS[p.b].label,
      ab: p.ab,
      ba: p.ba,
      total: p.ab + p.ba,
      distance: p.b - p.a,
    }));
    const jumps = rows.reduce((n, r) => n + r.total, 0);
    const adjacent = rows.filter((r) => r.distance === 1).reduce((n, r) => n + r.total, 0);
    return {
      top: rows.sort((x, y) => y.total - x.total).slice(0, PAIRS_SHOWN),
      adjacentShare: jumps ? adjacent / jumps : null,
    };
  });

  // Intensidad del color según la parte (0–1); con mucho color el texto pasa a claro
  protected heat(share: number): string | null {
    return share > 0 ? `color-mix(in srgb, var(--oj-primary) ${Math.round(8 + share * 72)}%, transparent)` : null;
  }

  protected strong(share: number): boolean {
    return share > 0.5;
  }

  protected percent(share: number): string {
    return Math.round(share * 100) + '%';
  }
}
