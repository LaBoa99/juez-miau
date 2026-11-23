import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap, type Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EditionStatus, FlagOutcome, ICreateTeam, IFlag, IRoomListItem, IStaffSubmission, ITeamListItem, StaffRole } from '@concurso/shared-types';
import { VerdictPipe } from '../../../../shared/pipes/verdict.pipe';
import { FlagsService } from '../../../flags/data/flags.service';
import { flagLabel, flagMessage, flagTone } from '../../../flags/flag-display';
import { ProblemsService } from '../../../problems/data/problems.service';
import { SubmissionsService } from '../../../submissions/data/submissions.service';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Icon } from '../../../../shared/ui/icon.component';
import { TooltipDirective } from '../../../../shared/ui/tooltip.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { AuthService } from '../../../../core/auth/auth.service';
import { TeamsService } from '../../data/teams.service';
import { RoomsService } from '../../../editions/rooms/data/rooms.service';
import { StandingsService } from '../../../standings/data/standings.service';
import { TeamImport } from '../team-import/team-import';
import { downloadTeamCredentialsPdf, TeamCredentialPage } from '../../data/credentials-pdf';
import { backendMessage } from '../../../../core/http/backend-error.mapper';

const PAGE_SIZE = 20;
const REFRESH_MS = 15_000;
const WATCH_SUBMISSIONS = 10;
const SESSION_LABEL = { on: 'Sesión iniciada', lost: 'Sesión iniciada, sin señal', off: 'Sin sesión' } as const;

const MEMBERS_INCOMPLETE = 'Cada integrante necesita nombre y carrera.';

@Component({
  selector: 'oj-team-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    VerdictPipe,
    ReactiveFormsModule,
    PageHeader,
    ButtonDirective, Icon, TooltipDirective,
    Badge,
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
  private readonly roomsService = inject(RoomsService);
  private readonly standings = inject(StandingsService);
  private readonly flagsService = inject(FlagsService);
  private readonly submissions = inject(SubmissionsService);
  private readonly problems = inject(ProblemsService);
  private readonly destroyRef = inject(DestroyRef);

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
  // Cambiar de categoría mueve al equipo de marcador: solo en borrador (el backend lo valida igual)
  protected readonly canChangeCategory = computed(() => this.ctx.edition()?.status === EditionStatus.DRAFT);

  protected readonly categoryCtrl = this.fb.control<number | null>(null);
  protected readonly searchCtrl = this.fb.control('');

  protected readonly showingFrom = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1));
  protected readonly showingTo = computed(() => Math.min(this.page() * PAGE_SIZE, this.total()));
  protected readonly hasPrev = computed(() => this.page() > 1);
  protected readonly hasNext = computed(() => this.page() * PAGE_SIZE < this.total());

  // ─── Editar ───
  private readonly editModal = viewChild.required<Modal>('editModal');
  protected readonly editSaving = signal(false);
  protected readonly editError = signal<string | null>(null);
  private editingId: number | null = null;
  protected readonly editForm = this.fb.group({
    name: ['', [Validators.required]],
    categoryId: [null as number | null],
    roomId: [null as number | null],
    members: this.fb.array<FormGroup>([]),
  });
  // Cualquier salón de la edición: puede tener equipos de varias categorías
  protected readonly allRooms = signal<IRoomListItem[]>([]);

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
    // null = automático: el backend propone el salón según la categoría
    roomId: [null as number | null],
    members: this.fb.array<FormGroup>([]),
  });

  // ─── Vigilar un equipo ───
  protected readonly watchModal = viewChild.required<Modal>('watchModal');
  protected readonly watched = signal<ITeamListItem | null>(null);
  protected readonly watchFlags = signal<IFlag[]>([]);
  protected readonly watchSubmissions = signal<IStaffSubmission[]>([]);
  protected readonly watchLoading = signal(false);
  protected readonly watchError = signal(false);
  protected readonly openFlags = computed(() => this.watchFlags().filter((f) => !f.resolvedAt).length);
  private readonly problemLetters = signal<Map<number, string>>(new Map());
  private loadSeq = 0;
  protected readonly flagMessage = flagMessage;

  constructor() {
    this.load();
    // La sesión no llega por socket: mientras la página esté abierta se actualiza sola
    const refresh = setInterval(() => {
      if (!this.loading()) this.load(true);
      if (this.watched()) this.loadWatch();
    }, REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(refresh));
    this.editForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.editError() === MEMBERS_INCOMPLETE && this.members().valid) this.editError.set(null);
    });
    this.roomsService.list(this.editionId).subscribe({ next: (rooms) => this.allRooms.set(rooms), error: () => {} });
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

  // silent: actualización de fondo, sin "Cargando…" que quite la tabla
  load(silent = false): void {
    const seq = ++this.loadSeq;
    if (!silent) {
      this.loading.set(true);
      this.error.set(false);
    }
    this.service
      .list(this.editionId, {
        categoryId: this.categoryCtrl.value ?? undefined,
        search: this.searchCtrl.value ?? undefined,
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.loadSeq) return; // ya se pidió otra página o filtro
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
          const watched = res.items.find((t) => t.id === this.watched()?.id);
          if (watched) this.watched.set(watched);
        },
        error: () => {
          if (seq !== this.loadSeq) return;
          if (!silent) this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  sessionState(t: ITeamListItem): keyof typeof SESSION_LABEL {
    return !t.online ? 'off' : t.signalLost ? 'lost' : 'on';
  }

  sessionLabel(t: ITeamListItem): string {
    return SESSION_LABEL[this.sessionState(t)];
  }

  openWatch(team: ITeamListItem): void {
    this.watched.set(team);
    this.watchFlags.set([]);
    this.watchSubmissions.set([]);
    this.watchError.set(false);
    this.watchLoading.set(true);
    this.watchModal().open();
    this.loadWatch();
    if (!this.problemLetters().size) {
      this.problems.list(this.editionId).subscribe({
        next: (ps) => this.problemLetters.set(new Map(ps.map((p) => [p.id, p.letter ?? '—']))),
        error: () => {},
      });
    }
  }

  closeWatch(): void {
    this.watched.set(null);
  }

  private loadWatch(): void {
    const teamId = this.watched()?.id;
    if (teamId === undefined) return;
    forkJoin({
      flags: this.flagsService.list(this.editionId, { teamId }),
      submissions: this.submissions.listForEdition(this.editionId, { teamId, limit: WATCH_SUBMISSIONS }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ flags, submissions }) => {
          if (this.watched()?.id !== teamId) return;
          this.watchFlags.set(flags);
          this.watchSubmissions.set(submissions);
          this.watchError.set(false);
          this.watchLoading.set(false);
        },
        error: () => {
          if (this.watched()?.id !== teamId) return;
          this.watchError.set(true);
          this.watchLoading.set(false);
        },
      });
  }

  flagStatus(f: IFlag): string {
    if (!f.resolvedAt) return f.offense > 1 ? `REINCIDENCIA · ${f.offense}.ª FALTA` : flagLabel(f.type);
    return f.outcome === FlagOutcome.CONFIRMED ? 'CONFIRMADA · +20' : f.outcome === FlagOutcome.DISMISSED ? 'DESCARTADA' : 'RESUELTA';
  }

  flagStatusTone(f: IFlag) {
    if (f.outcome === FlagOutcome.CONFIRMED || (!f.resolvedAt && f.offense > 1)) return 'danger';
    return f.resolvedAt ? 'neutral' : flagTone(f.type);
  }

  problemLetter(id: number): string {
    return this.problemLetters().get(id) ?? '#' + id;
  }

  minute(contestMs: number): number {
    return Math.max(0, Math.floor(contestMs / 60000));
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
        this.makePdf([pdfPage(team, cred)], `credenciales-${slug(team.name)}.pdf`),
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
            ? of([] as TeamCredentialPage[])
            : forkJoin(
                teams.map((t) =>
                  this.service
                    .getCredentials(t.id)
                    .pipe(map((c) => pdfPage(t, c))),
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

  private makePdf(pages: TeamCredentialPage[], fileName: string): void {
    downloadTeamCredentialsPdf(pages, fileName, this.editionName())
      .then(({ logoMissing }) => {
        this.pdfBusy.set(null);
        if (logoMissing) {
          this.logoWarning.set(
            'No se encontró algún logo (logo-cuvalles.png o gatito-512.png); el PDF se generó sin esa imagen.',
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
    this.addForm.reset({ name: '', categoryId: null, roomId: null });
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
    const dto: ICreateTeam = {
      name: raw.name!,
      category_id: raw.categoryId!,
      ...(raw.roomId != null ? { room_id: raw.roomId } : {}),
      members,
    };

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
    this.editForm.patchValue({ name: team.name, categoryId: team.category?.id ?? null, roomId: team.room?.id ?? null });
    const category = this.editForm.controls.categoryId;
    if (this.canChangeCategory()) category.enable();
    else category.disable();
    this.editModal().open();
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
      // Los integrantes no usan oj-form-field: su aviso va arriba del modal
      if (this.members().invalid) this.editError.set(MEMBERS_INCOMPLETE);
      focusFirstInvalid();
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
    const room = raw.roomId != null ? { room_id: raw.roomId } : {};
    const category = this.canChangeCategory() && raw.categoryId != null ? { category_id: raw.categoryId } : {};
    this.service.update(this.editingId, { name: raw.name!, members, ...room, ...category }).subscribe({
      next: () => {
        this.editSaving.set(false);
        this.editModal().close();
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

  // Suspendido: se cierra su sesión, no puede entrar ni enviar y queda al final del marcador
  askSuspend(team: ITeamListItem): void {
    const suspend = !team.suspended;
    const [title, msg, label] = suspend
      ? ['Suspender equipo', `${team.name} saldrá de la app y no podrá entrar ni enviar. En el marcador queda tachado y sin lugar.`, 'Suspender']
      : ['Reactivar equipo', `${team.name} podrá volver a entrar y enviar.`, 'Reactivar'];
    this.openConfirm(title, msg, label, suspend, () => {
      this.standings.setSuspended(this.editionId, team.id, suspend).subscribe({
        next: () => {
          this.flashSuccess(suspend ? `${team.name} quedó suspendido.` : `${team.name} fue reactivado.`);
          this.load();
        },
        error: (err) => this.actionError.set(message(err, 'No se pudo cambiar la suspensión del equipo.')),
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

// Hoja del PDF de un equipo: con su categoría, salón e integrantes para no confundir las hojas en el laboratorio
function pdfPage(t: ITeamListItem, c: { username: string; password: string }): TeamCredentialPage {
  return {
    teamName: t.name,
    username: c.username,
    password: c.password,
    category: t.category?.name ?? null,
    room: t.room?.name ?? null,
    members: t.members.map((m) => m.name),
  };
}
