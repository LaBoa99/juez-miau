import { HttpContextToken, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ToastService } from './toast.service';

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Escrituras que no guardan nada: sesión, proyector público, validar importación, corridas de prueba y los clics
// de la barra de secciones (prueba de calor).
const NOT_SAVES = ['/api/auth/', '/api/public/', '/import/validate', '/test-runs', '/nav-events'];

// Una escritura que es parte de otra acción que ya avisa (p. ej. hacer públicos los casos recién creados)
export const SILENT_SAVE = new HttpContextToken<boolean>(() => false);

// Aviso de "Cambios guardados" tras cualquier escritura exitosa del panel.
export const savedInterceptor: HttpInterceptorFn = (req, next) => {
  if (!WRITES.has(req.method) || req.context.get(SILENT_SAVE) || NOT_SAVES.some((p) => req.url.includes(p))) return next(req);
  const toast = inject(ToastService);
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        if (req.method === 'DELETE') toast.show('Eliminado', 'Se eliminó correctamente', 'neutral');
        else toast.show('Guardado', 'Cambios guardados', 'neutral');
      }
    }),
  );
};
