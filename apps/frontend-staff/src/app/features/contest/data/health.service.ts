import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IHealth } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  // Devuelve 503 si BD/Redis están caídos; el body llega igual con el detalle.
  get(): Observable<IHealth> {
    return this.http.get<IHealth>(`${API}/health`);
  }
}
