import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IContestClock, IStandings } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

// Proyector: rutas públicas (sin sesión). El authInterceptor no les adjunta token ni renueva.
@Injectable({ providedIn: 'root' })
export class ProjectorService {
  private readonly http = inject(HttpClient);

  clock(editionId: number): Observable<IContestClock> {
    return this.http.get<IContestClock>(`${API}/public/editions/${editionId}/clock`);
  }

  standings(editionId: number): Observable<IStandings> {
    return this.http.get<IStandings>(`${API}/public/editions/${editionId}/standings`);
  }
}
