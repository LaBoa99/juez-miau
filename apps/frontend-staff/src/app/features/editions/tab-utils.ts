import type { ActivatedRoute } from '@angular/router';

// El id de la edición vive en el segmento ':id', varios niveles arriba de la pestaña.
export function findEditionId(route: ActivatedRoute): number {
  const param = route.pathFromRoot.map((r) => r.snapshot.paramMap.get('id')).find((v) => v != null);
  return Number(param);
}

// Mensaje de error del backend (string o array de class-validator), con texto de respaldo.
export function message(err: unknown, fallback: string): string {
  const m = (err as { error?: { message?: unknown } })?.error?.message;
  if (Array.isArray(m)) return m.join(', ');
  return typeof m === 'string' ? m : fallback;
}
