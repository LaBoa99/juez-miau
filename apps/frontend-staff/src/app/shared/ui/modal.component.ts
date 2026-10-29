import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;
// Solo un modal abierto a la vez en toda la app.
let currentOpen: Modal | null = null;

// Diálogo modal nativo (<dialog>). Crear con formulario inline; editar/programar/ver/confirmar con oj-modal.
@Component({
  selector: 'oj-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dlg
      class="oj-modal"
      [attr.data-size]="size()"
      [attr.aria-labelledby]="titleId"
      (close)="onClose()"
      (click)="onBackdropClick($event)"
    >
      <div class="oj-modal__head">
        <h2 class="oj-modal__title" [id]="titleId">{{ title() }}</h2>
        <button type="button" class="oj-modal__x" aria-label="Cerrar" (click)="close()">×</button>
      </div>
      <div class="oj-modal__body"><ng-content /></div>
      <div class="oj-modal__footer"><ng-content select="[footer]" /></div>
    </dialog>
  `,
  styles: `
    /* Sin regla de display para el dialog cerrado: conserva el display:none nativo. */
    .oj-modal {
      padding: 0;
      width: var(--w);
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 64px);
      background: var(--oj-bg);
      color: var(--oj-text);
      border: 1px solid var(--oj-text);
      border-radius: var(--oj-radius);
      box-shadow: none;
      /* centrado: lo da el navegador (margin:auto, position fixed nativa del <dialog>) */
    }
    /* El layout solo cuando está abierto. */
    .oj-modal[open] {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .oj-modal[data-size='sm'] { --w: 420px; }
    .oj-modal[data-size='md'] { --w: 560px; }
    .oj-modal[data-size='lg'] { --w: 720px; }
    .oj-modal::backdrop {
      background: var(--oj-backdrop);
    }
    .oj-modal__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--oj-space-md);
      padding: var(--oj-space-md);
      border-bottom: 1px solid var(--oj-border);
    }
    .oj-modal__title {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }
    .oj-modal__x {
      border: 0;
      background: transparent;
      padding: 0;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      color: var(--oj-text-muted);
    }
    .oj-modal__body {
      padding: var(--oj-space-lg) var(--oj-space-md);
      overflow-y: auto;
    }
    .oj-modal__footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      padding: var(--oj-space-md);
      border-top: 1px solid var(--oj-border);
    }
    .oj-modal__footer:empty {
      display: none;
    }
    /* Las páginas proyectan los botones dentro de un <div footer>: ese wrapper también
       debe repartir con gap, para cualquier número de botones. */
    .oj-modal__footer ::ng-deep [footer] {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class Modal {
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  readonly title = input<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  // oj-confirm-dialog lo pone en false: una confirmación no se descarta clicando el fondo.
  readonly closeOnBackdrop = input(true);
  readonly closed = output<void>();

  protected readonly titleId = `oj-modal-title-${nextId++}`;
  private opener: HTMLElement | null = null;

  open(): void {
    // Si otro modal está abierto, se cierra primero.
    if (currentOpen && currentOpen !== this) currentOpen.close();
    currentOpen = this;

    this.opener = (document.activeElement as HTMLElement) ?? null;
    const el = this.dlg().nativeElement;
    el.showModal();
    // Foco al primer campo del cuerpo (o al botón cerrar si no hay).
    queueMicrotask(() => {
      const body = el.querySelector<HTMLElement>('.oj-modal__body');
      const target =
        body?.querySelector<HTMLElement>(
          'input, select, textarea, button, [tabindex]:not([tabindex="-1"]), a[href]',
        ) ?? el.querySelector<HTMLElement>('.oj-modal__x');
      target?.focus();
    });
  }

  close(): void {
    this.dlg().nativeElement.close();
  }

  // Dispara en close(), con Esc y con la "×" (el <dialog> emite 'close' en todos los casos).
  protected onClose(): void {
    if (currentOpen === this) currentOpen = null;
    this.closed.emit();
    this.opener?.focus();
    this.opener = null;
  }

  // Clic en el fondo: el target es el propio <dialog> (el contenido lo cubre por completo).
  protected onBackdropClick(event: MouseEvent): void {
    if (this.closeOnBackdrop() && event.target === this.dlg().nativeElement) {
      this.close();
    }
  }
}
