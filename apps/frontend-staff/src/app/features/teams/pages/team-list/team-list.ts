import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap, type Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EditionStatus, ICreateTeam, ITeamImportCredential, ITeamListItem, StaffRole } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { SidePanel } from '../../../../shared/ui/side-panel.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { AuthService } from '../../../../core/auth/auth.service';
import { TeamsService } from '../../data/teams.service';
import { TeamImport } from '../team-import/team-import';
import { downloadCredentialsPdf } from '../../data/credentials-pdf';
import { backendMessage } from '../../../../core/http/backend-error.mapper';

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
    Modal,
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
  private readonly auth = inject(AuthService);

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
  // "Permiso de edición" = ADMIN de la edición (o superadmin). Gatea el PDF y el alta.
  protected readonly canEdit = computed(
    () => this.auth.isSuperadmin() || this.auth.roleInEdition(this.editionId) === StaffRole.ADMIN,
  );
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

  // ─── PDF de credenciales ───
  // Qué descarga está en curso: id de un equipo, 'all', o null. La contraseña no se guarda.
  protected readonly pdfBusy = signal<number | 'all' | null>(null);
  protected readonly logoWarning = signal<string | null>(null);

  // ─── Agregar equipo ───
  private readonly addModal = viewChild<Modal>('addModal');
  protected readonly addSaving = signal(false);
  protected readonly addError = signal<string | null>(null);
  protected readonly addNameError = signal<string | null>(null);
  protected readonly addCategoryError = signal<string | null>(null);
  protected readonly addMembersError = signal<string | null>(null);
  protected readonly addForm = this.fb.group({
    name: ['', [Validators.required]],
    categoryId: this.fb.control<number | null>(null, [Validators.required]),
    members: this.fb.array<FormGroup>([]),
  });

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

  // ─── PDF de credenciales ───
  downloadOne(team: ITeamListItem): void {
    this.actionError.set(null);
    this.logoWarning.set(null);
    this.pdfBusy.set(team.id);
    // La contraseña se pide aquí y se usa solo para el PDF; nunca se guarda en el estado.
    this.service.getCredentials(team.id).subscribe({
      next: (cred) =>
        this.makePdf(
          [{ teamName: team.name, username: cred.username, password: cred.password }],
          `credenciales-${slug(team.name)}.pdf`,
        ),
      error: (err) => {
        this.pdfBusy.set(null);
        this.actionError.set(backendMessage(err, 'No se pudo descargar el PDF.'));
      },
    });
  }

  downloadAll(): void {
    this.actionError.set(null);
    this.logoWarning.set(null);
    this.pdfBusy.set('all');
    this.fetchAllTeams()
      .pipe(
        switchMap((teams) =>
          teams.length === 0
            ? of([] as ITeamImportCredential[])
            : forkJoin(
                teams.map((t) =>
                  this.service
                    .getCredentials(t.id)
                    .pipe(map((c) => ({ teamName: t.name, username: c.username, password: c.password }))),
                ),
              ),
        ),
      )
      .subscribe({
        next: (creds) => {
          if (creds.length === 0) {
            this.pdfBusy.set(null);
            this.actionError.set('No hay equipos para descargar.');
            return;
          }
          this.makePdf(creds, `credenciales-${slug(this.editionName() || 'equipos')}.pdf`);
        },
        error: (err) => {
          this.pdfBusy.set(null);
          this.actionError.set(backendMessage(err, 'No se pudo descargar el PDF.'));
        },
      });
  }

  private makePdf(creds: ITeamImportCredential[], fileName: string): void {
    downloadCredentialsPdf(creds, fileName)
      .then(({ logoMissing }) => {
        this.pdfBusy.set(null);
        if (logoMissing) {
          this.logoWarning.set(
            'No se encontró el logo (logo-cuvalles.png); el PDF se generó solo con el texto del encabezado.',
          );
        }
      })
      .catch(() => {
        this.pdfBusy.set(null);
        this.actionError.set('No se pudo generar el PDF.');
      });
  }

  // Todos los equipos de la edición (respeta los filtros activos), recorriendo las páginas de 100.
  private fetchAllTeams(): Observable<ITeamListItem[]> {
    const base = {
      categoryId: this.categoryCtrl.value ?? undefined,
      search: this.searchCtrl.value ?? undefined,
    };
    const SIZE = 100;
    return this.service.list(this.editionId, { ...base, page: 1, pageSize: SIZE }).pipe(
      switchMap((first) => {
        const pages = Math.ceil(first.total / SIZE);
        if (pages <= 1) return of(first.items);
        const rest: Observable<ITeamListItem[]>[] = [];
        for (let p = 2; p <= pages; p++) {
          rest.push(this.service.list(this.editionId, { ...base, page: p, pageSize: SIZE }).pipe(map((r) => r.items)));
        }
        return forkJoin(rest).pipe(map((arrs) => first.items.concat(...arrs)));
      }),
    );
  }

  // ─── Agregar equipo ───
  addMembers(): FormArray<FormGroup> {
    return this.addForm.get('members') as FormArray<FormGroup>;
  }

  openAdd(): void {
    this.addError.set(null);
    this.addNameError.set(null);
    this.addCategoryError.set(null);
    this.addMembersError.set(null);
    this.addForm.reset({ name: '', categoryId: null });
    this.addMembers().clear();
    this.addMembers().push(this.memberGroup());
    this.addModal()?.open();
  }

  addMemberRow(): void {
    if (this.addMembers().length < 3) this.addMembers().push(this.memberGroup());
  }

  removeAddMember(i: number): void {
    if (this.addMembers().length > 1) this.addMembers().removeAt(i);
  }

  submitAdd(): void {
    this.addError.set(null);
    this.addNameError.set(null);
    this.addCategoryError.set(null);
    this.addMembersError.set(null);

    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      this.addNameError.set(this.addForm.get('name')?.invalid ? 'Escribe el nombre del equipo.' : null);
      this.addCategoryError.set(this.addForm.get('categoryId')?.invalid ? 'Elige una categoría.' : null);
      this.addMembersError.set(
        this.addMembers().invalid ? 'Cada integrante necesita nombre y carrera.' : null,
      );
      this.addError.set('No se pudo agregar el equipo. Revisa los campos marcados.');
      focusFirstInvalid();
      return;
    }

    const raw = this.addForm.getRawValue();
    const members = (raw.members as { name: string; career: string }[]).map((m) => ({
      name: m.name,
      career: m.career,
    }));
    const dto: ICreateTeam = { name: raw.name!, category_id: raw.categoryId!, members };

    this.addSaving.set(true);
    this.service.create(this.editionId, dto).subscribe({
      next: () => {
        this.addSaving.set(false);
        this.addModal()?.close();
        this.flashSuccess('Equipo agregado');
        this.page.set(1);
        this.load();
      },
      error: (err) => {
        this.addSaving.set(false);
        // No hay campo al que anclar el rechazo del backend: va al aviso superior, traducido.
        this.addError.set(backendMessage(err, 'No se pudo agregar el equipo.'));
      },
    });
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
  return backendMessage(err, fallback);
}

// Nombre de archivo seguro a partir del nombre del equipo/edición.
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'equipo'
  );
}

// Lleva el foco al primer campo inválido dentro del modal abierto (tras validar al Guardar).
function focusFirstInvalid(): void {
  queueMicrotask(() => {
    const el = document.querySelector<HTMLElement>(
      '.oj-modal[open] input.ng-invalid, .oj-modal[open] select.ng-invalid',
    );
    el?.focus();
  });
}
