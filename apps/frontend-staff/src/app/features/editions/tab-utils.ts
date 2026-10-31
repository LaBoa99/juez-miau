import type { ActivatedRoute } from '@angular/router';
import { backendMessage } from '../../core/http/backend-error.mapper';

// El id de la edición vive en el segmento ':id', varios niveles arriba de la pestaña.
export function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}

// Error del backend traducido a español; nunca devuelve el texto crudo (ese va a consola).
export function message(err: unknown, fallback: string): string {
  return backendMessage(err, fallback);
}
