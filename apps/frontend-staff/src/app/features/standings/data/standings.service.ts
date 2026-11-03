import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IStandings } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class StandingsService {
  private readonly http = inject(HttpClient);

  // Marcador del staff: siempre completo (no se congela).
  getForStaff(editionId: number): Observable<IStandings> {
    return this.http.get<IStandings>(`${API}/editions/${editionId}/standings`);
  }

  // Suspendido: tachado y al final del marcador, sin lugar. Solo admin de la edición.
  setSuspended(editionId: number, teamId: number, suspended: boolean): Observable<void> {
    return this.http.put<void>(`${API}/editions/${editionId}/teams/${teamId}/suspension`, { suspended });
  }

  // CSV del marcador del staff (sin congelar); el token lo agrega el interceptor.
  downloadCsv(editionId: number): Observable<Blob> {
    return this.http.get(`${API}/editions/${editionId}/exports/standings.csv`, { responseType: 'blob' });
  }
}
