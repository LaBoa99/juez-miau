import { Injectable, signal } from '@angular/core';
import type { IContestClock } from '@concurso/shared-types';

// Reloj de la edición que el staff tiene abierta. Lo llena el layout de la edición (HTTP al entrar
// y clock:update después) y lo leen el header, Marcador y Concurso: una sola fuente para el tiempo.
@Injectable({ providedIn: 'root' })
export class LiveClockService {
  private readonly _clock = signal<IContestClock | null>(null);
  readonly clock = this._clock.asReadonly();

  set(clock: IContestClock): void {
    this._clock.set(clock);
  }

  clear(editionId: number): void {
    if (this._clock()?.editionId === editionId) this._clock.set(null);
  }
}
