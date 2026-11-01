import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IAuditEntry } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

// Filtros que el backend soporta de verdad. No hay filtro por método, ruta ni fecha, ni total de
// registros: la paginación es por cursor hacia atrás (`before` = id, trae los anteriores a ese id).
export interface IAuditQuery {
  staffUserId?: number | null;
  before?: number | null;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);

  list(query: IAuditQuery): Observable<IAuditEntry[]> {
    let params = new HttpParams();
    if (query.staffUserId != null) params = params.set('staffUserId', query.staffUserId);
    if (query.before != null) params = params.set('before', query.before);
    if (query.limit != null) params = params.set('limit', query.limit);
    return this.http.get<IAuditEntry[]>(`${API}/audit`, { params });
  }
}
