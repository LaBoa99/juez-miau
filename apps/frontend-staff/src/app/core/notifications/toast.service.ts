import { Injectable, signal } from '@angular/core';

export type ToastTone = 'danger' | 'warning' | 'neutral';

export interface Toast {
  id: number;
  title: string;
  detail: string;
  tone: ToastTone;
}

const MAX_VISIBLE = 3;
const AUTO_CLOSE_MS = 8000;

// Avisos de la esquina inferior derecha (solo staff). Como máximo tres a la vez: el más viejo sale
// al llegar uno nuevo. Cada aviso se cierra solo o con su botón ×.
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(title: string, detail: string, tone: ToastTone): void {
    const toast: Toast = { id: this.nextId++, title, detail, tone };
    const list = [...this._toasts(), toast];
    for (const old of list.splice(0, Math.max(0, list.length - MAX_VISIBLE))) this.clearTimer(old.id);
    this._toasts.set(list);
    this.timers.set(toast.id, setTimeout(() => this.dismiss(toast.id), AUTO_CLOSE_MS));
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    for (const id of this.timers.keys()) this.clearTimer(id);
    this._toasts.set([]);
  }

  private clearTimer(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
}
