import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  EditionStatus,
  ICreateEdition,
  IEdition,
  IEditionListItem,
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

  create(dto: ICreateEdition): Observable<IEdition> {
    return this.http.post<IEdition>(EDITIONS, dto);
  }
}
