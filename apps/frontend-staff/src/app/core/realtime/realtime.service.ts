import { Injectable, effect, inject, signal } from '@angular/core';
import { Subject, type Observable } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type IContestClock,
  type IFlag,
  type IStaffClarification,
  type IClarificationDeleted,
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
  // Salas a re-unir tras reconectar ("staff:<id>" / "public:<id>") y cuántas pantallas las usan:
  // el layout de la edición y la página abierta piden la misma sala, y salir de la página no debe
  // sacar al layout (antes se borraba y, al reconectar, ya no se volvía a unir: se perdían alertas).
  private readonly joined = new Map<string, number>();

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
  private readonly clarification$ = new Subject<IStaffClarification>();
  private readonly clarificationDelete$ = new Subject<IClarificationDeleted>();

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
  // Pregunta nueva o respondida (el staff recibe la versión con el equipo)
  onClarification(): Observable<IStaffClarification> {
    this.ensure();
    return this.clarification$.asObservable();
  }
  // Aclaración eliminada (o rechazada: luego llega su versión actualizada por onClarification)
  onClarificationDelete(): Observable<IClarificationDeleted> {
    this.ensure();
    return this.clarificationDelete$.asObservable();
  }

  // ─── Salas ───
  joinEdition(editionId: number): void {
    this.ensure();
    this.retain('staff:' + editionId);
    this._active.set(true);
    this.emitJoin('staff', editionId);
  }

  joinPublic(editionId: number): void {
    this.ensure();
    this.retain('public:' + editionId);
    this._active.set(true);
    this.emitJoin('public', editionId);
  }

  // Una pantalla deja de seguir la edición (no cierra la conexión). La sala se suelta cuando ya
  // nadie la usa; el servidor no tiene evento de salida, así que el socket sigue en ella hasta
  // reconectar (inofensivo: los componentes ya no escuchan).
  leave(editionId: number): void {
    this.release('staff:' + editionId);
    this.release('public:' + editionId);
    if (this.joined.size === 0) this._active.set(false);
  }

  private retain(key: string): void {
    this.joined.set(key, (this.joined.get(key) ?? 0) + 1);
  }

  private release(key: string): void {
    const n = this.joined.get(key);
    if (n === undefined) return;
    n <= 1 ? this.joined.delete(key) : this.joined.set(key, n - 1);
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
    // El staff también está en la sala pública y recibe la versión anónima (sin equipo): se ignora
    socket.on(SOCKET_EVENTS.CLARIFICATION_UPDATE, (p: IStaffClarification) => {
      if (p.teamId != null) this.clarification$.next(p);
    });
    socket.on(SOCKET_EVENTS.CLARIFICATION_DELETE, (p: IClarificationDeleted) => this.clarificationDelete$.next(p));

    this.socket = socket;
    return socket;
  }

  private rejoin(): void {
    for (const key of this.joined.keys()) {
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
