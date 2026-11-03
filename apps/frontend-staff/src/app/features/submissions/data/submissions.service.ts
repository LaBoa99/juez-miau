import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  IRejudgeResponse,
  IReviewSubmission,
  IStaffSubmission,
  IStaffSubmissionDetail,
  ISubmissionHistoryEntry,
  ISubmissionCaseDetail,
  ISubmissionReview,
} from '@concurso/shared-types';
import { EMPTY, Observable, expand, reduce } from 'rxjs';

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

  // Todos los envíos de la edición: el backend no da conteos, así que el total sale de la lista
  // completa (se pide de 200 en 200 hacia atrás con el cursor `before`).
  listAllForEdition(editionId: number): Observable<IStaffSubmission[]> {
    const LIMIT = 200;
    return this.listForEdition(editionId, { limit: LIMIT }).pipe(
      expand((rows) => (rows.length === LIMIT ? this.listForEdition(editionId, { before: rows[rows.length - 1].id, limit: LIMIT }) : EMPTY)),
      reduce((all, rows) => all.concat(rows), [] as IStaffSubmission[]),
    );
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

  // Todas las revisiones manuales del envío, la más reciente primero
  reviews(id: number): Observable<ISubmissionReview[]> {
    return this.http.get<ISubmissionReview[]>(`${API}/submissions/${id}/reviews`);
  }

  // Entrada y salidas de un caso (solo juez/admin; incluye casos ocultos)
  caseDetail(id: number, ordinal: number): Observable<ISubmissionCaseDetail> {
    return this.http.get<ISubmissionCaseDetail>(`${API}/submissions/${id}/cases/${ordinal}`);
  }

  // Cola de revisión manual (PENDING_REVIEW) de la edición, más viejos primero.
  // Manda a revisión manual un envío ya juzgado (queda PENDING_REVIEW)
  sendToReview(id: number): Observable<IStaffSubmission> {
    return this.http.post<IStaffSubmission>(`${API}/submissions/${id}/manual-review`, {});
  }

  reviewQueue(editionId: number): Observable<IStaffSubmission[]> {
    return this.http.get<IStaffSubmission[]>(`${API}/editions/${editionId}/review-queue`);
  }

  // Decisión del juez: accept=true → AC, false → WA.
  review(id: number, dto: IReviewSubmission): Observable<IStaffSubmission> {
    return this.http.post<IStaffSubmission>(`${API}/submissions/${id}/review`, dto);
  }

  // CSV del staff (admin/juez) como blob; el token lo agrega el interceptor.
  downloadCsv(editionId: number): Observable<Blob> {
    return this.http.get(`${API}/editions/${editionId}/exports/submissions.csv`, { responseType: 'blob' });
  }
}
