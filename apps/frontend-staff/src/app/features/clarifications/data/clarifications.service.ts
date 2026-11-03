import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IStaffClarification } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class ClarificationsService {
  private readonly http = inject(HttpClient);

  // Todas las de la edición, la más reciente primero.
  list(editionId: number): Observable<IStaffClarification[]> {
    return this.http.get<IStaffClarification[]>(`${API}/editions/${editionId}/clarifications`);
  }

  // Responder de nuevo reemplaza la respuesta (sirve para corregirla).
  answer(editionId: number, id: number, answer: string): Observable<IStaffClarification> {
    return this.http.post<IStaffClarification>(`${API}/editions/${editionId}/clarifications/${id}/answer`, { answer });
  }

  // Deja de ser pública; solo la ve el equipo que preguntó (como rechazada).
  reject(editionId: number, id: number): Observable<IStaffClarification> {
    return this.http.post<IStaffClarification>(`${API}/editions/${editionId}/clarifications/${id}/reject`, {});
  }

  remove(editionId: number, id: number): Observable<void> {
    return this.http.delete<void>(`${API}/editions/${editionId}/clarifications/${id}`);
  }
}
