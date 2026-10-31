import { Injectable, effect, inject, signal } from '@angular/core';
import { Subject, type Observable } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type IContestClock,
  type IFlag,
  type IJoinEdition,
  type IStaffSubmission,
  type IStandings,
  type ISubmission,
  type ISubmissionProgress,
} from '@concurso/shared-types';
import { AuthService } from '../auth/auth.service';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

// Una sola conexión de Socket.io por pestaña (namespace /ws). Se crea al primer uso (joinEdition
// o joinPublic / onXxx) y se cierra en logout. Regla de uso: cargar por HTTP al entrar, actualizar
// con estos eventos, dejar de escuchar al salir (los componentes desuscriben sus Observables).
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);

  private socket: Socket | null = null;
  // Salas a re-unir tras reconectar: claves "staff:<id>" / "public:<id>".
  private readonly joined = new Set<string>();

  private readonly _connectionState = signal<ConnectionState>('disconnected');
  readonly connectionState = this._connectionState.asReadonly();
  // El indicador del header solo aparece cuando hay una edición seguida.
  private readonly _active = signal(false);
  readonly active = this._active.asReadonly();

  private readonly clock$ = new Subject<IContestClock>();
  private readonly standings$ = new Subject<IStandings>();
  private readonly submission$ = new Subject<ISubmission | IStaffSubmission>();
  private readonly progress$ = new Subject<ISubmissionProgress>();
  private readonly flag$ = new Subject<IFlag>();

  constructor() {
    // Al cerrar sesión (logout o expiración) se cierra la conexión.
    effect(() => {
      if (!this.auth.isAuthenticated() && this.socket) this.disconnect();
    });
  }

  // ─── Suscripción tipada por evento ───
  onClock(): Observable<IContestClock> {
    this.ensure();
    return this.clock$.asObservable();
  }
  onStandings(): Observable<IStandings> {
    this.ensure();
    return this.standings$.asObservable();
  }
  onSubmission(): Observable<ISubmission | IStaffSubmission> {
    this.ensure();
    return this.submission$.asObservable();
  }
  onSubmissionProgress(): Observable<ISubmissionProgress> {
    this.ensure();
    return this.progress$.asObservable();
  }
  onFlag(): Observable<IFlag> {
    this.ensure();
    return this.flag$.asObservable();
  }

  // ─── Salas ───
  joinEdition(editionId: number): void {
    this.ensure();
    this.joined.add('staff:' + editionId);
    this._active.set(true);
    this.emitJoin('staff', editionId);
  }

  joinPublic(editionId: number): void {
    this.ensure();
    this.joined.add('public:' + editionId);
    this._active.set(true);
    this.emitJoin('public', editionId);
  }

  // Dejar de seguir una edición (no cierra la conexión).
  leave(editionId: number): void {
    this.joined.delete('staff:' + editionId);
    this.joined.delete('public:' + editionId);
    if (this.joined.size === 0) this._active.set(false);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.joined.clear();
    this._active.set(false);
    this._connectionState.set('disconnected');
  }

  private ensure(): Socket {
    if (this.socket) return this.socket;

    // auth como función: el token se vuelve a leer en cada (re)conexión, así usa el vigente.
    const socket = io('/ws', {
      auth: (cb) => cb({ token: this.auth.getAccessToken() ?? undefined }),
    });
    this._connectionState.set('connecting');

    socket.on('connect', () => {
      this._connectionState.set('connected');
      this.rejoin();
    });
    socket.on('disconnect', () => this._connectionState.set('disconnected'));
    socket.io.on('reconnect_attempt', () => this._connectionState.set('connecting'));
    socket.io.on('error', () => this._connectionState.set('connecting'));

    socket.on(SOCKET_EVENTS.CLOCK_UPDATE, (p: IContestClock) => this.clock$.next(p));
    socket.on(SOCKET_EVENTS.STANDINGS_UPDATE, (p: IStandings) => this.standings$.next(p));
    socket.on(SOCKET_EVENTS.SUBMISSION_UPDATE, (p: ISubmission | IStaffSubmission) => this.submission$.next(p));
    socket.on(SOCKET_EVENTS.SUBMISSION_PROGRESS, (p: ISubmissionProgress) => this.progress$.next(p));
    socket.on(SOCKET_EVENTS.FLAG_UPDATE, (p: IFlag) => this.flag$.next(p));

    this.socket = socket;
    return socket;
  }

  private rejoin(): void {
    for (const key of this.joined) {
      const [mode, id] = key.split(':');
      this.emitJoin(mode as 'staff' | 'public', Number(id));
    }
  }

  private emitJoin(mode: 'staff' | 'public', editionId: number): void {
    if (!this.socket?.connected) return; // al conectar, rejoin() se encarga
    const event = mode === 'staff' ? SOCKET_EVENTS.JOIN_EDITION : SOCKET_EVENTS.JOIN_PUBLIC;
    const body: IJoinEdition = { editionId };
    this.socket.emit(event, body);
  }
}
