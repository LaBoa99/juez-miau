import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ILoginData,
  ILoginResponse,
  IMeResponse,
  IRefreshResponse,
  IStaffUser,
} from '@concurso/shared-types';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, switchMap, tap } from 'rxjs';

const AUTH = '/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // Token solo en memoria: el backend lo entrega en el body, nunca en localStorage/sessionStorage.
  private accessToken: string | null = null;
  private refreshInFlight: Observable<IRefreshResponse> | null = null;

  private readonly _user = signal<IStaffUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  getAccessToken(): string | null {
    return this.accessToken;
  }

  login(credentials: ILoginData): Observable<ILoginResponse> {
    return this.http
      .post<ILoginResponse>(`${AUTH}/staff/login`, credentials, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.accessToken = res.accessToken;
          this._user.set(res.user);
        }),
      );
  }

  me(): Observable<IMeResponse> {
    return this.http.get<IMeResponse>(`${AUTH}/me`).pipe(tap((res) => this._user.set(res)));
  }

  refresh(): Observable<IRefreshResponse> {
    // Single-flight: varias renovaciones simultáneas comparten una sola llamada.
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http
        .post<IRefreshResponse>(`${AUTH}/refresh`, {}, { withCredentials: true })
        .pipe(
          tap((res) => (this.accessToken = res.accessToken)),
          finalize(() => (this.refreshInFlight = null)),
          shareReplay(1),
        );
    }
    return this.refreshInFlight;
  }

  logout(): void {
    this.http
      .post<void>(`${AUTH}/logout`, {}, { withCredentials: true })
      .pipe(finalize(() => this.clearSession()))
      .subscribe({ error: () => {} });
  }

  clearSession(): void {
    this.accessToken = null;
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  // Rehidrata la sesión al arrancar: la cookie httpOnly permite renovar el access y recargar el perfil.
  restore(): Promise<void> {
    return firstValueFrom(
      this.refresh().pipe(
        switchMap(() => this.me()),
        map(() => undefined),
        catchError(() => {
          this.accessToken = null;
          this._user.set(null);
          return of(undefined);
        }),
      ),
    );
  }
}
