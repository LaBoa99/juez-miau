import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  ICategory,
  IEditionStaff,
  IProjectorTokenResponse,
  IRoomListItem,
  IStaffListItem,
  StaffRole,
} from '@concurso/shared-types';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { FormField } from '../../../shared/ui/form-field.component';
import { Alert } from '../../../shared/ui/alert.component';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { SidePanel } from '../../../shared/ui/side-panel.component';
import { RoomsService } from './data/rooms.service';
import { CategoriesService } from '../categories/data/categories.service';
import { EditionStaffService } from '../edition-staff/data/edition-staff.service';
import { EditionContext } from '../pages/edition-layout/edition-context';
import { findEditionId, message } from '../tab-utils';

@Component({
  selector: 'oj-rooms-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonDirective, FormField, Alert, ConfirmDialog, SidePanel],
  templateUrl: './rooms-tab.html',
  styleUrls: ['../tab.css', './rooms-tab.css'],
})
export class RoomsTab {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(RoomsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly staffService = inject(EditionStaffService);
  private readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);

  protected readonly editionId = findEditionId(this.route);

  protected readonly rows = signal<IRoomListItem[]>([]);
  protected readonly categories = signal<ICategory[]>([]);
  protected readonly editionStaff = signal<IEditionStaff[]>([]);
  private readonly staffNames = signal<Map<number, string>>(new Map());

  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Solo un OBSERVER de la edición puede asignarse a un salón (regla del backend).
  protected readonly observers = computed(() =>
    this.editionStaff().filter((s) => s.role === StaffRole.OBSERVER),
  );

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    category_id: [null as number | null],
  });

  private readonly dialog = viewChild.required(ConfirmDialog);
  private pendingDelete: IRoomListItem | null = null;

  // Panel del token de proyector
  protected readonly token = signal<IProjectorTokenResponse | null>(null);
  protected readonly tokenRoom = signal<IRoomListItem | null>(null);

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
    this.categoriesService.list(this.editionId).subscribe({ next: (c) => this.categories.set(c), error: () => {} });
    this.staffService.list(this.editionId).subscribe({ next: (s) => this.editionStaff.set(s), error: () => {} });
    // Nombres (GET /staff es superadmin-only): si falla, se muestran los #id.
    this.staffService.staffUsers().subscribe({
      next: (users: IStaffListItem[]) => this.staffNames.set(new Map(users.map((u) => [u.id, u.name]))),
      error: () => {},
    });
  }

  categoryName(id: number | null): string {
    if (id == null) return '—';
    return this.categories().find((c) => c.id === id)?.name ?? '#' + id;
  }

  staffName(id: number): string {
    return this.staffNames().get(id) ?? '#' + id;
  }

  // Observadores de la edición que aún no están en ese salón
  availableObservers(room: IRoomListItem): IEditionStaff[] {
    const assigned = new Set(room.observers.map((o) => o.staff_user_id));
    return this.observers().filter((o) => !assigned.has(o.staff_user_id));
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, category_id } = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set(null);
    this.service.create(this.editionId, { name, category_id: category_id ?? null }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ name: '', category_id: null });
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(message(err, 'No se pudo crear el salón.'));
      },
    });
  }

  addObserver(roomId: number, staffUserId: string): void {
    const id = Number(staffUserId);
    if (!id) return;
    this.service.addObserver(roomId, id).subscribe({
      next: () => this.load(),
      error: (err) => this.formError.set(message(err, 'No se pudo asignar el observador.')),
    });
  }

  removeObserver(roomId: number, staffUserId: number): void {
    this.service.removeObserver(roomId, staffUserId).subscribe({
      next: () => this.load(),
      error: (err) => this.formError.set(message(err, 'No se pudo quitar el observador.')),
    });
  }

  askDelete(room: IRoomListItem): void {
    this.pendingDelete = room;
    this.dialog().open();
  }

  remove(): void {
    const room = this.pendingDelete;
    if (!room) return;
    this.service.remove(room.id).subscribe({
      next: () => this.load(),
      error: (err) => this.formError.set(message(err, 'No se pudo eliminar el salón.')),
    });
  }

  generateToken(room: IRoomListItem): void {
    this.tokenRoom.set(room);
    this.token.set(null);
    this.service.generateToken(room.id).subscribe({
      next: (res) => this.token.set(res),
      error: (err) => this.formError.set(message(err, 'No se pudo generar el token.')),
    });
  }

  revokeToken(): void {
    const room = this.tokenRoom();
    if (!room) return;
    this.service.revokeToken(room.id).subscribe({ next: () => this.closeToken() });
  }

  closeToken(): void {
    this.token.set(null);
    this.tokenRoom.set(null);
  }
}
