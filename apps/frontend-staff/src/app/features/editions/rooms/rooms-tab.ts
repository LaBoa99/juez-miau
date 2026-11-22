import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ICategory,
  IEditionStaff,
  IRoomListItem,
  IStaffListItem,
  StaffRole,
} from '@concurso/shared-types';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { Icon } from '../../../shared/ui/icon.component';
import { TooltipDirective } from '../../../shared/ui/tooltip.directive';
import { FormField } from '../../../shared/ui/form-field.component';
import { Alert } from '../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { Modal } from '../../../shared/ui/modal.component';
import { EmptyState } from '../../../shared/ui/empty-state.component';
import { RoomsService } from './data/rooms.service';
import { CategoriesService } from '../categories/data/categories.service';
import { EditionStaffService } from '../edition-staff/data/edition-staff.service';
import { EditionContext } from '../pages/edition-layout/edition-context';
import { findEditionId, message } from '../tab-utils';

@Component({
  selector: 'oj-rooms-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ButtonDirective, Icon, TooltipDirective, FormField, Alert, ConfirmDialog, Modal, EmptyState],
  templateUrl: './rooms-tab.html',
  styleUrls: ['../tab.css', './rooms-tab.css'],
})
export class RoomsTab {
  // Qué es esta pestaña: la página de Configuración lo muestra debajo de las pestañas
  readonly intro = 'Los salones son los laboratorios donde se sientan los equipos. Sirven para filtrar el marcador y el proyector por salón y para asignar observadores que lo vigilan. Si marcas sus categorías, los equipos nuevos de esas categorías se reparten solos entre esos salones.';

  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(RoomsService);
  private readonly staffService = inject(EditionStaffService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);

  protected readonly editionId = findEditionId(this.route);

  protected readonly rows = signal<IRoomListItem[]>([]);
  protected readonly editionStaff = signal<IEditionStaff[]>([]);
  protected readonly categories = signal<ICategory[]>([]);
  private readonly staffNames = signal<Map<number, string>>(new Map());

  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly obsWarning = signal<string | null>(null);

  // Observadores de la edición (único rol que el backend acepta asignar a un salón).
  protected readonly observers = computed(() =>
    this.editionStaff().filter((s) => s.role === StaffRole.OBSERVER),
  );

  // ─── Alta (formulario a la derecha) ───
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly addObs = signal<Set<number>>(new Set());
  protected readonly addCats = signal<Set<number>>(new Set());
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
  });

  // ─── Editar (modal) ───
  private readonly editModal = viewChild.required(Modal);
  private editingRoom: IRoomListItem | null = null;
  protected readonly editSaving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editObs = signal<Set<number>>(new Set());
  protected readonly editCats = signal<Set<number>>(new Set());
  protected readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
  });

  // ─── Confirmaciones ───
  private readonly deleteDialog = viewChild.required<ConfirmDialog>('deleteDlg');
  private readonly obsDialog = viewChild.required<ConfirmDialog>('obsDlg');
  private pendingDelete: IRoomListItem | null = null;
  private pendingObs: { roomId: number; staffUserId: number } | null = null;
  protected readonly obsConfirmMessage = signal('');

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.editionId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.ctx.setCount('salones', rows.length);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    this.staffService.list(this.editionId).subscribe({ next: (s) => this.editionStaff.set(s), error: () => {} });
    this.categoriesService.list(this.editionId).subscribe({ next: (c) => this.categories.set(c), error: () => {} });
    // Nombres (GET /staff es superadmin-only): si falla, se muestran los #id.
    this.staffService.staffUsers().subscribe({
      next: (users: IStaffListItem[]) => this.staffNames.set(new Map(users.map((u) => [u.id, u.name]))),
      error: () => {},
    });
  }

  staffName(id: number): string {
    return this.staffNames().get(id) ?? '#' + id;
  }

  categoryCodes(room: IRoomListItem): string {
    return room.categories.map((c) => c.code).join(', ');
  }

  // ─── Alta ───
  toggleAdd(id: number, checked: boolean): void {
    this.addObs.update((s) => toggle(s, id, checked));
  }

  toggleAddCat(id: number, checked: boolean): void {
    this.addCats.update((s) => toggle(s, id, checked));
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name } = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set(null);
    this.obsWarning.set(null);
    this.service.create(this.editionId, { name, category_ids: [...this.addCats()] }).subscribe({
      next: (room) => {
        this.applyObservers(room.id, [...this.addObs()], []).subscribe((failed) => {
          this.saving.set(false);
          this.warnFailures(failed);
          this.form.reset({ name: '' });
          this.addObs.set(new Set());
          this.addCats.set(new Set());
          this.load();
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(message(err, 'No se pudo crear el salón.'));
      },
    });
  }

  // ─── Editar ───
  openEdit(room: IRoomListItem): void {
    this.editingRoom = room;
    this.editError.set(null);
    this.obsWarning.set(null);
    this.editForm.reset({ name: room.name });
    this.editObs.set(new Set(room.observers.map((o) => o.staff_user_id)));
    this.editCats.set(new Set(room.categories.map((c) => c.id)));
    this.editModal().open();
  }

  toggleEdit(id: number, checked: boolean): void {
    this.editObs.update((s) => toggle(s, id, checked));
  }

  toggleEditCat(id: number, checked: boolean): void {
    this.editCats.update((s) => toggle(s, id, checked));
  }

  submitEdit(): void {
    const room = this.editingRoom;
    if (this.editForm.invalid || !room) {
      this.editForm.markAllAsTouched();
      return;
    }
    const { name } = this.editForm.getRawValue();
    this.editSaving.set(true);
    this.editError.set(null);
    this.obsWarning.set(null);
    this.service.update(room.id, { name, category_ids: [...this.editCats()] }).subscribe({
      next: () => {
        const current = room.observers.map((o) => o.staff_user_id);
        this.applyObservers(room.id, [...this.editObs()], current).subscribe((failed) => {
          this.editSaving.set(false);
          this.editModal().close();
          this.warnFailures(failed);
          this.load();
        });
      },
      error: (err) => {
        this.editSaving.set(false);
        this.editError.set(message(err, 'No se pudo guardar el salón.'));
      },
    });
  }

  closeEdit(): void {
    this.editModal().close();
  }

  // Asigna/quita observadores según la selección; resuelve con los nombres que fallaron.
  private applyObservers(roomId: number, desired: number[], current: number[]) {
    const toAdd = desired.filter((id) => !current.includes(id));
    const toRemove = current.filter((id) => !desired.includes(id));
    const ops = [
      ...toAdd.map((id) =>
        this.service.addObserver(roomId, id).pipe(
          map(() => null),
          catchError(() => of(this.staffName(id))),
        ),
      ),
      ...toRemove.map((id) =>
        this.service.removeObserver(roomId, id).pipe(
          map(() => null),
          catchError(() => of(this.staffName(id))),
        ),
      ),
    ];
    return ops.length
      ? forkJoin(ops).pipe(map((r) => r.filter((x): x is string => x !== null)))
      : of<string[]>([]);
  }

  private warnFailures(failed: string[]): void {
    if (failed.length) {
      this.obsWarning.set('El salón se guardó, pero no se pudo asignar: ' + failed.join(', '));
    }
  }

  // ─── Quitar observador desde el chip de la tabla ───
  askRemoveObserver(room: IRoomListItem, staffUserId: number): void {
    this.pendingObs = { roomId: room.id, staffUserId };
    this.obsConfirmMessage.set(`Se quitará a ${this.staffName(staffUserId)} de ${room.name}.`);
    this.obsDialog().open();
  }

  removeObserver(): void {
    const p = this.pendingObs;
    if (!p) return;
    this.service.removeObserver(p.roomId, p.staffUserId).subscribe({
      next: () => this.load(),
      error: (err) => this.obsWarning.set(message(err, 'No se pudo quitar el observador.')),
    });
  }

  // ─── Eliminar salón ───
  askDelete(room: IRoomListItem): void {
    this.pendingDelete = room;
    this.deleteDialog().open();
  }

  remove(): void {
    const room = this.pendingDelete;
    if (!room) return;
    this.service.remove(room.id).subscribe({
      next: () => this.load(),
      error: (err) => this.formError.set(message(err, 'No se pudo eliminar el salón.')),
    });
  }
}

function toggle(set: Set<number>, id: number, checked: boolean): Set<number> {
  const next = new Set(set);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}
