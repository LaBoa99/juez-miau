import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Guard para rutas que en el backend son solo de superadmin (@SuperadminOnly), p.ej. /staff y /auditoria.
// Un usuario sin permiso se redirige a /403.
// Depende de que el backend exponga is_superadmin en /auth/me; mientras no lo haga, isSuperadmin() es false
// y estas rutas quedan cerradas para todos (ver sección "Antes del deploy" en docs/frontend-claude.md).
export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isSuperadmin() || router.createUrlTree(['/403']);
};
