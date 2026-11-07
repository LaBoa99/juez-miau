// Borradores sin guardar en localStorage (por navegador): si sales de un paso, al volver se recuperan.
// localStorage puede no existir o fallar (modo privado, cuota): entonces simplemente no hay borrador.

const PREFIX = 'oj:draft:';

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // sin espacio o sin permiso: se pierde el borrador, no el trabajo en pantalla
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // nada que limpiar
  }
}
