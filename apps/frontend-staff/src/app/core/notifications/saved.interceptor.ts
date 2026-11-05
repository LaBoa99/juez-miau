import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ToastService } from './toast.service';

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Escrituras que no guardan nada: sesión, proyector público, validar importación y corridas de prueba.
const NOT_SAVES = ['/api/auth/', '/api/public/', '/import/validate', '/test-runs'];

// Aviso de "Cambios guardados" tras cualquier escritura exitosa del panel.
export const savedInterceptor: HttpInterceptorFn = (req, next) => {
  if (!WRITES.has(req.method) || NOT_SAVES.some((p) => req.url.includes(p))) return next(req);
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
