// La interfaz trabaja en minutos; el backend guarda duración y congelamiento en milisegundos.
export function msToMin(ms: number): number {
  return Math.round(ms / 60000);
}

export function minToMs(min: number): number {
  return Math.round(min * 60000);
}

// ms → "HH:MM:SS" (reloj del concurso, marcador y proyector). Negativos se tratan como 0.
export function msToClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
