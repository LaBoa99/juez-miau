import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ICreateEditionStaff,
  IEditionStaff,
  IStaffListItem,
  StaffRole,
} from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class EditionStaffService {
  private readonly http = inject(HttpClient);

  list(editionId: number): Observable<IEditionStaff[]> {
    return this.http.get<IEditionStaff[]>(`${API}/editions/${editionId}/staff`);
  }

  assign(editionId: number, staffUserId: number, role: StaffRole): Observable<IEditionStaff> {
    const body: ICreateEditionStaff = { staff_user_id: staffUserId, role };
    return this.http.post<IEditionStaff>(`${API}/editions/${editionId}/staff`, body);
  }

  remove(editionId: number, staffUserId: number): Observable<void> {
    return this.http.delete<void>(`${API}/editions/${editionId}/staff/${staffUserId}`);
  }

  // Catálogo de usuarios de staff (GET /staff es superadmin-only en el backend)
  staffUsers(): Observable<IStaffListItem[]> {
    return this.http.get<IStaffListItem[]>(`${API}/staff`);
  }
}
