// La interfaz trabaja en minutos; el backend guarda duración y congelamiento en milisegundos.
export function msToMin(ms: number): number {
  return Math.round(ms / 60000);
}

export function minToMs(min: number): number {
  return Math.round(min * 60000);
}
