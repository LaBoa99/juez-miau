import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IContestClock } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class ContestClockService {
  private readonly http = inject(HttpClient);

  get(editionId: number): Observable<IContestClock> {
    return this.http.get<IContestClock>(`${API}/editions/${editionId}/clock`);
  }

  start(editionId: number): Observable<IContestClock> {
    return this.http.post<IContestClock>(`${API}/editions/${editionId}/clock/start`, {});
  }

  pause(editionId: number): Observable<IContestClock> {
    return this.http.post<IContestClock>(`${API}/editions/${editionId}/clock/pause`, {});
  }

  resume(editionId: number): Observable<IContestClock> {
    return this.http.post<IContestClock>(`${API}/editions/${editionId}/clock/resume`, {});
  }

  finish(editionId: number): Observable<IContestClock> {
    return this.http.post<IContestClock>(`${API}/editions/${editionId}/clock/finish`, {});
  }
}
