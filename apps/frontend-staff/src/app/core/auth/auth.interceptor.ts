import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

// Marca un request ya reintentado tras renovar, para no renovar en bucle.
const RETRIED = new HttpContextToken<boolean>(() => false);

// Peticiones sin sesión: no se les adjunta Bearer ni se intenta renovar sobre ellas.
// Incluye los endpoints de auth y las rutas públicas del proyector (/api/public/...).
const skipAuth = (url: string) =>
  url.includes('/api/auth/staff/login') ||
  url.includes('/api/auth/refresh') ||
  url.includes('/api/auth/logout') ||
  url.includes('/api/public/');

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const token = auth.getAccessToken();
  const authReq =
    token && !skipAuth(req.url)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      const canRetry =
        err.status === 401 && !skipAuth(req.url) && !req.context.get(RETRIED);

      if (!canRetry) {
        return throwError(() => err);
      }

      return auth.refresh().pipe(
        switchMap(() =>
          next(
            req.clone({
              context: req.context.set(RETRIED, true),
              setHeaders: { Authorization: `Bearer ${auth.getAccessToken()}` },
            }),
          ),
        ),
        catchError((refreshErr) => {
          auth.clearSession();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
