import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EditionStatus, ITeamListItem } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { SidePanel } from '../../../../shared/ui/side-panel.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { TeamsService } from '../../data/teams.service';
import { TeamImport } from '../team-import/team-import';

const PAGE_SIZE = 20;

@Component({
  selector: 'oj-team-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeader,
    ButtonDirective,
    Badge,
    SidePanel,
    FormField,
    Alert,
    ConfirmDialog,
    EmptyState,
    TeamImport,
  ],
  templateUrl: './team-list.html',
  styleUrl: './team-list.css',
})
export class TeamList {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(TeamsService);
  protected readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);

  protected readonly editionId = findEditionId(this.route);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly items = signal<ITeamListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly page = signal(1);

  protected readonly actionError = signal<string | null>(null);
  protected readonly actionSuccess = signal<string | null>(null);

  protected readonly categories = computed(() => this.ctx.edition()?.categories ?? []);
  protected readonly editionName = computed(() => this.ctx.edition()?.name ?? '');
  // Importar solo en DRAFT o SCHEDULED (el backend hace assertIsEditable).
  protected readonly canImport = computed(() => {
    const s = this.ctx.edition()?.status;
    return s === EditionStatus.DRAFT || s === EditionStatus.SCHEDULED;
  });

  protected readonly categoryCtrl = this.fb.control<number | null>(null);
  protected readonly searchCtrl = this.fb.control('');

  protected readonly showingFrom = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1));
  protected readonly showingTo = computed(() => Math.min(this.page() * PAGE_SIZE, this.total()));
  protected readonly hasPrev = computed(() => this.page() > 1);
  protected readonly hasNext = computed(() => this.page() * PAGE_SIZE < this.total());

  // ─── Editar ───
  protected readonly editOpen = signal(false);
  protected readonly editSaving = signal(false);
  protected readonly editError = signal<string | null>(null);
  private editingId: number | null = null;
  protected readonly editForm = this.fb.group({
    name: ['', [Validators.required]],
    members: this.fb.array<FormGroup>([]),
  });

  // ─── Confirmación reutilizable ───
  private readonly confirm = viewChild.required(ConfirmDialog);
  protected readonly confirmTitle = signal('');
  protected readonly confirmMessage = signal('');
  protected readonly confirmLabel = signal('Aceptar');
  protected readonly confirmDanger = signal(false);
  private pendingAction: (() => void) | null = null;

  constructor() {
    this.load();
    this.categoryCtrl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.page.set(1);
      this.load();
    });
    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service
      .list(this.editionId, {
        categoryId: this.categoryCtrl.value ?? undefined,
        search: this.searchCtrl.value ?? undefined,
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  prev(): void {
    if (this.hasPrev()) {
      this.page.update((p) => p - 1);
      this.load();
    }
  }

  next(): void {
    if (this.hasNext()) {
      this.page.update((p) => p + 1);
      this.load();
    }
  }

  onImported(): void {
    this.page.set(1);
    this.load();
  }

  memberNames(team: ITeamListItem): string {
    return team.members.map((m) => m.name).join(', ');
  }

  members(): FormArray<FormGroup> {
    return this.editForm.get('members') as FormArray<FormGroup>;
  }

  private memberGroup(m?: { id: number; name: string; career: string }): FormGroup {
    return this.fb.group({
      id: [m?.id ?? null],
      name: [m?.name ?? '', [Validators.required]],
      career: [m?.career ?? '', [Validators.required]],
    });
  }

  openEdit(team: ITeamListItem): void {
    this.editingId = team.id;
    this.editError.set(null);
    this.members().clear();
    for (const m of team.members) this.members().push(this.memberGroup(m));
    this.editForm.patchValue({ name: team.name });
    this.editOpen.set(true);
  }

  addMember(): void {
    if (this.members().length < 3) this.members().push(this.memberGroup());
  }

  removeNewMember(i: number): void {
    this.members().removeAt(i);
  }

  submitEdit(): void {
    if (this.editForm.invalid || this.editingId == null) {
      this.editForm.markAllAsTouched();
      return;
    }
    const raw = this.editForm.getRawValue();
    const members = (raw.members as { id: number | null; name: string; career: string }[]).map((m) => ({
      ...(m.id != null ? { id: m.id } : {}),
      name: m.name,
      career: m.career,
    }));
    this.editSaving.set(true);
    this.editError.set(null);
    this.service.update(this.editingId, { name: raw.name!, members }).subscribe({
      next: () => {
        this.editSaving.set(false);
        this.editOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.editSaving.set(false);
        this.editError.set(message(err, 'No se pudo guardar.'));
      },
    });
  }

  askReset(team: ITeamListItem): void {
    this.openConfirm('Nueva contraseña', `¿Generar una nueva contraseña para ${team.name}?`, 'Generar', false, () => {
      this.service.resetPassword(team.id).subscribe({
        next: () => this.flashSuccess(`Se restableció la contraseña de ${team.name}.`),
        error: (err) => this.actionError.set(message(err, 'No se pudo restablecer la contraseña.')),
      });
    });
  }

  askCloseSession(team: ITeamListItem): void {
    this.openConfirm('Cerrar sesión', `Se cerrará la sesión activa de ${team.name}.`, 'Cerrar sesión', false, () => {
      this.service.closeSessions(team.id).subscribe({
        next: () => {
          this.flashSuccess(`Se cerró la sesión de ${team.name}.`);
          this.load();
        },
        error: (err) => this.actionError.set(message(err, 'No se pudo cerrar la sesión.')),
      });
    });
  }

  askDelete(team: ITeamListItem): void {
    this.openConfirm('Eliminar equipo', `Se eliminará «${team.name}». Esta acción no se puede deshacer.`, 'Eliminar', true, () => {
      this.service.remove(team.id).subscribe({
        next: () => this.load(),
        error: (err) => this.actionError.set(message(err, 'No se pudo eliminar el equipo.')),
      });
    });
  }

  private openConfirm(title: string, msg: string, label: string, danger: boolean, action: () => void): void {
    this.actionError.set(null);
    this.confirmTitle.set(title);
    this.confirmMessage.set(msg);
    this.confirmLabel.set(label);
    this.confirmDanger.set(danger);
    this.pendingAction = action;
    this.confirm().open();
  }

  onConfirmed(): void {
    const action = this.pendingAction;
    this.pendingAction = null;
    action?.();
  }

  private flashSuccess(msg: string): void {
    this.actionError.set(null);
    this.actionSuccess.set(msg);
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}

function message(err: unknown, fallback: string): string {
  const m = (err as { error?: { message?: unknown } })?.error?.message;
  if (Array.isArray(m)) return m.join(', ');
  return typeof m === 'string' ? m : fallback;
}
