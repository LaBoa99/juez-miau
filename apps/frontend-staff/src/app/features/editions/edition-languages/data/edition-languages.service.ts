import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IEditionLanguage, ILanguage } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class EditionLanguagesService {
  private readonly http = inject(HttpClient);

  catalog(): Observable<ILanguage[]> {
    return this.http.get<ILanguage[]>(`${API}/languages`);
  }

  ofEdition(editionId: number): Observable<IEditionLanguage[]> {
    return this.http.get<IEditionLanguage[]>(`${API}/editions/${editionId}/languages`);
  }

  set(editionId: number, ids: string[]): Observable<unknown> {
    return this.http.put(`${API}/editions/${editionId}/languages`, { ids });
  }
}
