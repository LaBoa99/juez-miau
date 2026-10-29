import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IEditionStaff, IStaffListItem, StaffRole } from '@concurso/shared-types';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { FormField } from '../../../shared/ui/form-field.component';
import { Badge } from '../../../shared/ui/badge.component';
import { Alert } from '../../../shared/ui/alert.component';
import { EditionStaffService } from './data/edition-staff.service';
import { EditionContext } from '../pages/edition-layout/edition-context';
import { findEditionId, message } from '../tab-utils';

@Component({
  selector: 'oj-edition-staff-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonDirective, FormField, Badge, Alert],
  templateUrl: './edition-staff-tab.html',
  styleUrl: '../tab.css',
})
export class EditionStaffTab {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(EditionStaffService);
  private readonly ctx = inject(EditionContext);
  private readonly fb = inject(FormBuilder);

  protected readonly editionId = findEditionId(this.route);
  protected readonly roles = Object.values(StaffRole);

  protected readonly rows = signal<IEditionStaff[]>([]);
  protected readonly users = signal<IStaffListItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Usuarios aún no asignados a la edición
  protected readonly available = computed(() => {
    const assigned = new Set(this.rows().map((r) => r.staff_user_id));
    return this.users().filter((u) => u.active && !assigned.has(u.id));
  });

  protected readonly form = this.fb.nonNullable.group({
    staff_user_id: [null as number | null, [Validators.required]],
    role: [StaffRole.JUDGE, [Validators.required]],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.editionId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.ctx.setCount('staff', rows.length);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    // GET /staff es superadmin-only: si falla, el select queda vacío y los nombres caen a #id.
    this.service.staffUsers().subscribe({ next: (u) => this.users.set(u), error: () => {} });
  }

  staffName(id: number): string {
    return this.users().find((u) => u.id === id)?.name ?? '#' + id;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { staff_user_id, role } = this.form.getRawValue();
    this.saving.set(true);
    this.formError.set(null);
    this.service.assign(this.editionId, staff_user_id!, role).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ staff_user_id: null, role: StaffRole.JUDGE });
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(message(err, 'No se pudo asignar.'));
      },
    });
  }

  remove(row: IEditionStaff): void {
    this.service.remove(this.editionId, row.staff_user_id).subscribe({
      next: () => this.load(),
      error: (err) => this.formError.set(message(err, 'No se pudo quitar.')),
    });
  }
}
