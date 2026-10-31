import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ICreateLanguage, IEditionLanguage, ILanguage } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class EditionLanguagesService {
  private readonly http = inject(HttpClient);

  // Catálogo global de lenguajes (lo comparten la pestaña de la edición y la página /lenguajes).
  catalog(): Observable<ILanguage[]> {
    return this.http.get<ILanguage[]>(`${API}/languages`);
  }

  create(dto: ICreateLanguage): Observable<ILanguage> {
    return this.http.post<ILanguage>(`${API}/languages`, dto);
  }

  // El backend solo alterna `active` (no edita los demás campos; el body se ignora).
  toggleActive(id: string): Observable<ILanguage> {
    return this.http.patch<ILanguage>(`${API}/languages/${id}`, {});
  }

  ofEdition(editionId: number): Observable<IEditionLanguage[]> {
    return this.http.get<IEditionLanguage[]>(`${API}/editions/${editionId}/languages`);
  }

  set(editionId: number, ids: string[]): Observable<unknown> {
    return this.http.put(`${API}/editions/${editionId}/languages`, { ids });
  }
}
