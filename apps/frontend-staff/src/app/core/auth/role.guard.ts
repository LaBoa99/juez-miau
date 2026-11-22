import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StaffRole } from '@concurso/shared-types';
import { AuthService } from './auth.service';

// Guard para rutas que en el backend son solo de superadmin (@SuperadminOnly), p.ej. /staff y /auditoria.
// Un usuario sin permiso se redirige a /403.
// El backend devuelve isSuperadmin tanto en el login como en /auth/me.
export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isSuperadmin() || router.createUrlTree(['/403']);
};

// Configuración de una edición: solo su admin (o un superadmin). El juez se va a Problemas y el observador a Envíos,
// que es donde empieza su trabajo; también al entrar a la edición, que abre en Configuración.
// Sin rol se deja pasar: el layout de la edición ya explica que falta que lo asignen
export const editionConfigGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const id = Number(route.parent?.paramMap.get('id'));
  const role = auth.roleInEdition(id);
  if (auth.isSuperadmin() || role === null || role === StaffRole.ADMIN) return true;
  return router.createUrlTree(['/ediciones', id, role === StaffRole.JUDGE ? 'problemas' : 'envios']);
};
