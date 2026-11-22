import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EditionStatus, IAuditEntry, INavCount } from '@concurso/shared-types';
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

  // Clics en la barra de secciones de las ediciones, agregados por rol y salto (prueba de calor)
  navCounts(editionId: number | null, status: EditionStatus | null): Observable<INavCount[]> {
    let params = new HttpParams();
    if (editionId != null) params = params.set('editionId', editionId);
    if (status != null) params = params.set('status', status);
    return this.http.get<INavCount[]>(`${API}/audit/navigation`, { params });
  }
}
