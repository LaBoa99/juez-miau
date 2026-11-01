import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ICreateFlag, IFlag, IResolveFlag } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class FlagsService {
  private readonly http = inject(HttpClient);

  // Sin `open` devuelve todas (abiertas y resueltas); la vista las separa en el cliente.
  list(editionId: number, opts: { open?: boolean } = {}): Observable<IFlag[]> {
    let params = new HttpParams();
    if (opts.open !== undefined) params = params.set('open', opts.open);
    return this.http.get<IFlag[]>(`${API}/editions/${editionId}/flags`, { params });
  }

  create(editionId: number, dto: ICreateFlag): Observable<IFlag> {
    return this.http.post<IFlag>(`${API}/editions/${editionId}/flags`, dto);
  }

  resolve(id: number, dto: IResolveFlag): Observable<IFlag> {
    return this.http.post<IFlag>(`${API}/flags/${id}/resolve`, dto);
  }
}
