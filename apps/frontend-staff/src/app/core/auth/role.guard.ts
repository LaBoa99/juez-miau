import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Guard para rutas que en el backend son solo de superadmin (@SuperadminOnly), p.ej. /staff y /auditoria.
// Un usuario sin permiso se redirige a /403.
// El backend devuelve isSuperadmin tanto en el login como en /auth/me.
export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isSuperadmin() || router.createUrlTree(['/403']);
};
