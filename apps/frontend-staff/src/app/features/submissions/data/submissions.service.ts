import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IStaffSubmission } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class SubmissionsService {
  private readonly http = inject(HttpClient);

  // Ventana de envíos de la edición (paginación hacia atrás con `before`).
  listForEdition(editionId: number, opts: { before?: number; limit?: number } = {}): Observable<IStaffSubmission[]> {
    let params = new HttpParams();
    if (opts.before !== undefined) params = params.set('before', opts.before);
    if (opts.limit !== undefined) params = params.set('limit', opts.limit);
    return this.http.get<IStaffSubmission[]>(`${API}/editions/${editionId}/submissions`, { params });
  }

  // CSV del staff (admin/juez) como blob; el token lo agrega el interceptor.
  downloadCsv(editionId: number): Observable<Blob> {
    return this.http.get(`${API}/editions/${editionId}/exports/submissions.csv`, { responseType: 'blob' });
  }
}
