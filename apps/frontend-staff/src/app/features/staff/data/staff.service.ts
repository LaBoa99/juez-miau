import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IStaffListItem } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

// Alta: todo obligatorio. Edición: parcial (la contraseña solo si se cambia).
export interface IStaffUpsert {
  name?: string;
  email?: string;
  password?: string;
}

// Lo que devuelven POST/PATCH (no trae createdAt ni isSuperadmin; la lista se recarga después).
export interface IStaffMutationResult {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);

  list(activeOnly: boolean, search: string): Observable<IStaffListItem[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('active', 'true');
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<IStaffListItem[]>(`${API}/staff`, { params });
  }

  create(dto: { name: string; email: string; password: string }): Observable<IStaffMutationResult> {
    return this.http.post<IStaffMutationResult>(`${API}/staff`, dto);
  }

  update(id: number, dto: IStaffUpsert): Observable<IStaffMutationResult> {
    return this.http.patch<IStaffMutationResult>(`${API}/staff/${id}`, dto);
  }

  // El backend solo desactiva (es irreversible: no hay endpoint para reactivar).
  deactivate(id: number): Observable<{ id: number; active: boolean }> {
    return this.http.post<{ id: number; active: boolean }>(`${API}/staff/${id}/deactivate`, {});
  }
}
