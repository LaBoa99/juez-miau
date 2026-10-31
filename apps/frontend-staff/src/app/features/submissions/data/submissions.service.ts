import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  IRejudgeResponse,
  IStaffSubmission,
  IStaffSubmissionDetail,
  ISubmissionHistoryEntry,
} from '@concurso/shared-types';
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

  // Con token de staff, /submissions/:id devuelve el detalle del staff (incluye source y casos).
  getForStaff(id: number): Observable<IStaffSubmissionDetail> {
    return this.http.get<IStaffSubmissionDetail>(`${API}/submissions/${id}`);
  }

  rejudge(id: number, reason: string): Observable<IRejudgeResponse> {
    return this.http.post<IRejudgeResponse>(`${API}/submissions/${id}/rejudge`, { reason });
  }

  history(id: number): Observable<ISubmissionHistoryEntry[]> {
    return this.http.get<ISubmissionHistoryEntry[]>(`${API}/submissions/${id}/history`);
  }

  // CSV del staff (admin/juez) como blob; el token lo agrega el interceptor.
  downloadCsv(editionId: number): Observable<Blob> {
    return this.http.get(`${API}/editions/${editionId}/exports/submissions.csv`, { responseType: 'blob' });
  }
}
