import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ICreateProblem,
  ICreateProblemResponse,
  IProblem,
  IProblemDetail,
  IProblemListItem,
  IProblemPreview,
  IProblemSignature,
  IPublishProblemResponse,
  IUpdateProblem,
} from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class ProblemsService {
  private readonly http = inject(HttpClient);

  list(editionId: number, categoryId?: number): Observable<IProblemListItem[]> {
    const params = categoryId ? new HttpParams().set('categoryId', categoryId) : undefined;
    return this.http.get<IProblemListItem[]>(`${API}/editions/${editionId}/problems`, { params });
  }

  get(id: number): Observable<IProblemDetail> {
    return this.http.get<IProblemDetail>(`${API}/problems/${id}`);
  }

  preview(id: number): Observable<IProblemPreview> {
    return this.http.get<IProblemPreview>(`${API}/problems/${id}/preview`);
  }

  create(editionId: number, dto: ICreateProblem): Observable<ICreateProblemResponse> {
    return this.http.post<ICreateProblemResponse>(`${API}/editions/${editionId}/problems`, dto);
  }

  update(id: number, dto: IUpdateProblem): Observable<IProblem> {
    return this.http.patch<IProblem>(`${API}/problems/${id}`, dto);
  }

  updateSignature(problemId: number, sig: IProblemSignature): Observable<IProblem> {
    return this.http.patch<IProblem>(`${API}/problems/${problemId}/signature`, sig);
  }

  publish(id: number): Observable<IPublishProblemResponse> {
    return this.http.post<IPublishProblemResponse>(`${API}/problems/${id}/publish`, {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/problems/${id}`);
  }
}
