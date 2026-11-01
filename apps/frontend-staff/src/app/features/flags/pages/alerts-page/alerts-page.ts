import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IEditionStaffListItem, IFlag } from '@concurso/shared-types';
import { PageHeader } from '../../../../shared/ui/page-header.component';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { Badge } from '../../../../shared/ui/badge.component';
import { Alert } from '../../../../shared/ui/alert.component';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { Segmented } from '../../../../shared/ui/segmented.component';
import { FormField } from '../../../../shared/ui/form-field.component';
import { Modal } from '../../../../shared/ui/modal.component';
import { backendMessage } from '../../../../core/http/backend-error.mapper';
import { AuthService } from '../../../../core/auth/auth.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { EditionContext } from '../../../editions/pages/edition-layout/edition-context';
import { RoomsService } from '../../../editions/rooms/data/rooms.service';
import { EditionStaffService } from '../../../editions/edition-staff/data/edition-staff.service';
import { TeamsService } from '../../../teams/data/teams.service';
import { FlagsService } from '../../data/flags.service';
import { FlagTone, flagLabel, flagMessage, flagTone } from '../../flag-display';

type Tab = 'open' | 'resolved';

@Component({
  selector: 'oj-alerts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    PageHeader,
    ButtonDirective,
    Badge,
    Alert,
    EmptyState,
    Segmented,
    FormField,
    Modal,
  ],
  templateUrl: './alerts-page.html',
  styleUrl: './alerts-page.css',
})
export class AlertsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(FlagsService);
  private readonly teamsService = inject(TeamsService);
  private readonly roomsService = inject(RoomsService);
  private readonly staffService = inject(EditionStaffService);
  private readonly auth = inject(AuthService);
  private readonly ctx = inject(EditionContext);
  protected readonly rt = inject(RealtimeService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editionId = findEditionId(this.route);

  // Lista maestra (más reciente primero); la vista se filtra en el cliente.
  protected readonly all = signal<IFlag[]>([]);
  protected readonly newIds = signal<ReadonlySet<number>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly actionError = signal<string | null>(null);

  // Búsquedas auxiliares que la alerta no trae.
  private readonly teamMap = signal<Map<number, { name: string; roomId: number | null }>>(new Map());
  private readonly staffMap = signal<Map<number, string>>(new Map());
  protected readonly rooms = signal<{ id: number; name: string }[]>([]);
  protected readonly myRoomId = signal<number | null>(null);

  // Filtros.
  protected readonly tab = signal<Tab>('open');
  protected readonly roomCtrl = this.fb.control<number | null>(null);
  protected readonly teamSearchCtrl = this.fb.nonNullable.control('');
  private readonly teamSearch = signal('');

  // Modal "Levantar alerta" (siempre tipo MANUAL: el backend no acepta otro tipo).
  private readonly createModal = viewChild.required<Modal>('createModal');
  private readonly teamField = viewChild<ElementRef<HTMLSelectElement>>('teamField');
  private readonly detailsField = viewChild<ElementRef<HTMLTextAreaElement>>('detailsField');
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  // Los errores de campo solo se muestran después de pulsar "Levantar alerta", no al abrir.
  protected readonly createSubmitted = signal(false);
  protected readonly teamCtrl = this.fb.control<number | null>(null, Validators.required);
  protected readonly detailsCtrl = this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(1000)]);

  // Modal de resolver.
  private readonly resolveModal = viewChild.required<Modal>('resolveModal');
  protected readonly resolveTarget = signal<IFlag | null>(null);
  protected readonly resolving = signal(false);
  protected readonly noteCtrl = this.fb.nonNullable.control('', [Validators.maxLength(1000)]);

  protected readonly teamOptions = computed(() =>
    [...this.teamMap()].map(([id, t]) => ({ id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name)),
  );
  protected readonly openCount = computed(() => this.all().filter((f) => f.resolvedAt == null).length);
  protected readonly tabOptions = computed(() => [
    { value: 'open', label: `Abiertas (${this.openCount()})` },
    { value: 'resolved', label: 'Resueltas' },
  ]);

  protected readonly filtered = computed(() => {
    const tab = this.tab();
    const room = this.roomCtrl.value;
    const search = this.teamSearch().trim().toLowerCase();
    const tm = this.teamMap();
    return this.all().filter((f) => {
      if (tab === 'open' ? f.resolvedAt != null : f.resolvedAt == null) return false;
      if (room != null && (tm.get(f.teamId)?.roomId ?? null) !== room) return false;
      if (search && !(tm.get(f.teamId)?.name ?? '').toLowerCase().includes(search)) return false;
      return true;
    });
  });

  // La edición bloquea envíos con cualquier alerta abierta del equipo.
  private readonly blocksSubmissions = computed(() => this.ctx.edition()?.block_submissions_on_alert === true);

  constructor() {
    this.loadLookups();
    this.load();

    this.teamSearchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((v) => this.teamSearch.set(v));

    this.rt.joinEdition(this.editionId);
    this.rt.onFlag().pipe(takeUntilDestroyed()).subscribe((f) => this.upsert(f, true));
    this.destroyRef.onDestroy(() => this.rt.leave(this.editionId));
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.editionId).subscribe({
      next: (rows) => {
        this.all.set([...rows].sort((a, b) => b.id - a.id));
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadLookups(): void {
    this.teamsService.list(this.editionId, { page: 1, pageSize: 100 }).subscribe({
      next: (res) =>
        this.teamMap.set(new Map(res.items.map((t) => [t.id, { name: t.name, roomId: t.room?.id ?? null }]))),
      error: () => {},
    });
    const me = this.auth.user()?.id ?? null;
    this.roomsService.list(this.editionId).subscribe({
      next: (rooms) => {
        this.rooms.set(rooms.map((r) => ({ id: r.id, name: r.name })));
        const mine = me != null ? rooms.find((r) => r.observers.some((o) => o.staff_user_id === me)) : undefined;
        if (mine) {
          this.myRoomId.set(mine.id);
          this.roomCtrl.setValue(mine.id); // observador: su salón queda por defecto
        }
      },
      error: () => {},
    });
    // Nombres para "Resuelta por": el personal de la edición (el listado incluye name).
    this.staffService.list(this.editionId).subscribe({
      next: (rows) =>
        this.staffMap.set(
          new Map((rows as IEditionStaffListItem[]).map((s) => [s.staff_user_id, s.name])),
        ),
      error: () => {},
    });
  }

  // Inserta o actualiza una alerta sin recargar; las nuevas van arriba (id desc) y se resaltan.
  private upsert(f: IFlag, flash = false): void {
    const list = this.all();
    const idx = list.findIndex((x) => x.id === f.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = f;
      this.all.set(next);
    } else {
      this.all.set([f, ...list].sort((a, b) => b.id - a.id));
      if (flash) this.flashNew(f.id);
    }
  }

  private flashNew(id: number): void {
    this.newIds.update((set) => new Set(set).add(id));
    setTimeout(() => {
      this.newIds.update((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }, 30);
  }

  isNew(id: number): boolean {
    return this.newIds().has(id);
  }

  onTab(value: string): void {
    this.tab.set(value as Tab);
  }

  // ─── Levantar alerta ───
  openCreate(): void {
    this.teamCtrl.reset(null);
    this.detailsCtrl.reset('');
    this.createSubmitted.set(false);
    this.createError.set(null);
    this.createModal().open();
  }

  // Errores de campo: solo tras pulsar el botón (createSubmitted) y con el control inválido.
  protected teamInvalid(): boolean {
    return this.createSubmitted() && this.teamCtrl.invalid;
  }
  protected detailsInvalid(): boolean {
    return this.createSubmitted() && this.detailsCtrl.invalid;
  }

  create(): void {
    this.createSubmitted.set(true);
    if (this.teamCtrl.invalid || this.detailsCtrl.invalid) {
      // El modal no se cierra mientras haya errores; el foco va al primer campo con error.
      this.createError.set('No se pudo levantar la alerta. Revisa los campos marcados.');
      const target = this.teamCtrl.invalid ? this.teamField() : this.detailsField();
      target?.nativeElement.focus();
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.service
      .create(this.editionId, { teamId: this.teamCtrl.value!, details: this.detailsCtrl.value.trim() })
      .subscribe({
        next: (f) => {
          this.creating.set(false);
          this.upsert(f, true);
          this.createModal().close();
        },
        error: (err) => {
          this.creating.set(false);
          this.createError.set(backendMessage(err, 'No se pudo levantar la alerta.'));
        },
      });
  }

  // ─── Resolver ───
  openResolve(f: IFlag): void {
    this.resolveTarget.set(f);
    this.noteCtrl.reset('');
    this.actionError.set(null);
    this.resolveModal().open();
  }

  confirmResolve(): void {
    const f = this.resolveTarget();
    if (!f || this.noteCtrl.invalid) {
      this.noteCtrl.markAsTouched();
      return;
    }
    this.resolving.set(true);
    this.actionError.set(null);
    const note = this.noteCtrl.value.trim();
    this.service.resolve(f.id, note ? { note } : {}).subscribe({
      next: (updated) => {
        this.resolving.set(false);
        this.upsert(updated);
        this.resolveModal().close();
      },
      error: (err) => {
        this.resolving.set(false);
        this.actionError.set(backendMessage(err, 'No se pudo resolver la alerta.'));
      },
    });
  }

  // ─── Datos de la tarjeta ───
  label(f: IFlag): string {
    return flagLabel(f.type);
  }
  tone(f: IFlag): FlagTone {
    return flagTone(f.type);
  }
  message(f: IFlag): string {
    return flagMessage(f);
  }
  teamName(id: number): string {
    return this.teamMap().get(id)?.name ?? '#' + id;
  }
  roomName(id: number): string {
    const roomId = this.teamMap().get(id)?.roomId;
    return (roomId != null ? this.rooms().find((r) => r.id === roomId)?.name : null) ?? 'Sin salón';
  }
  resolverName(f: IFlag): string {
    return f.resolvedBy != null ? this.staffMap().get(f.resolvedBy) ?? '#' + f.resolvedBy : 'el staff';
  }
  roomOptionLabel(r: { id: number; name: string }): string {
    return r.id === this.myRoomId() ? `Mi salón: ${r.name}` : r.name;
  }
  showBlockNotice(f: IFlag): boolean {
    return this.blocksSubmissions() && f.resolvedAt == null;
  }
}

function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}
