import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ITeamsPage,
  EditionStatus,
  ICreateEdition,
  IEdition,
  IEditionDetail,
  IEditionListItem,
  IEditionScheduleResponse,
  IProblemListItem,
  IUpdateEdition,
} from '@concurso/shared-types';
import { Observable } from 'rxjs';

const EDITIONS = '/api/editions';

@Injectable({ providedIn: 'root' })
export class EditionsService {
  private readonly http = inject(HttpClient);

  list(status?: EditionStatus): Observable<IEditionListItem[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<IEditionListItem[]>(EDITIONS, { params });
  }

  get(id: number): Observable<IEditionDetail> {
    return this.http.get<IEditionDetail>(`${EDITIONS}/${id}`);
  }

  create(dto: ICreateEdition): Observable<IEdition> {
    return this.http.post<IEdition>(EDITIONS, dto);
  }

  update(id: number, dto: IUpdateEdition): Observable<IEdition> {
    return this.http.patch<IEdition>(`${EDITIONS}/${id}`, dto);
  }

  schedule(id: number, scheduledStart: string): Observable<IEditionScheduleResponse> {
    return this.http.post<IEditionScheduleResponse>(`${EDITIONS}/${id}/schedule`, {
      scheduled_start: scheduledStart,
    });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${EDITIONS}/${id}`);
  }

  // Lecturas ligeras para los requisitos de "Programar edición".
  problems(id: number): Observable<IProblemListItem[]> {
    return this.http.get<IProblemListItem[]>(`${EDITIONS}/${id}/problems`);
  }

  teams(id: number): Observable<ITeamsPage> {
    return this.http.get<ITeamsPage>(`${EDITIONS}/${id}/teams`);
  }
}
