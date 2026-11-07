import { DestroyRef, Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';

let nextId = 0;

// Texto de ayuda al pasar el mouse o con foco de teclado. Hay UN solo globo para toda la app: al pasar
// de un elemento a otro se mueve (con animación) en vez de apilarse. Cada elemento guarda su texto en un
// span oculto enlazado con aria-describedby, así el lector de pantalla no depende del globo.
// Si el elemento no es enfocable por sí mismo, recibe tabindex=0 para que el teclado llegue.
@Directive({
  selector: '[ojTooltip]',
  host: {
    class: 'oj-tooltip-host',
    '[attr.aria-describedby]': 'id',
    '[attr.tabindex]': 'focusable ? null : 0',
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'onFocus()',
    '(focusout)': 'hide()',
    '(click)': 'hide()',
  },
})
export class TooltipDirective {
  readonly ojTooltip = input.required<string>();

  protected readonly id = 'oj-tooltip-' + nextId++;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly focusable = this.el.matches('a[href], button, input, select, textarea, [tabindex]');

  constructor() {
    const renderer = inject(Renderer2);
    const description: HTMLElement = renderer.createElement('span');
    renderer.addClass(description, 'oj-visually-hidden');
    renderer.setAttribute(description, 'id', this.id);
    renderer.appendChild(this.el, description);
    effect(() => renderer.setProperty(description, 'textContent', this.ojTooltip()));
    inject(DestroyRef).onDestroy(() => bubble.release(this.el));
  }

  protected show(): void {
    if (this.ojTooltip()) bubble.show(this.el, this.ojTooltip());
  }

  // El foco que deja un clic no muestra el globo; el del teclado sí
  protected onFocus(): void {
    if (this.el.matches(':focus-visible')) this.show();
  }

  protected hide(): void {
    bubble.hide(this.el);
  }
}

// El globo compartido: vive en <body>, en position: fixed, así ningún overflow lo recorta
const bubble = new (class {
  private el: HTMLElement | null = null;
  private owner: HTMLElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  show(host: HTMLElement, text: string): void {
    const tip = this.ensure();
    if (this.hideTimer) clearTimeout(this.hideTimer);
    // Un <dialog> modal se dibuja en una capa encima de <body>: dentro de uno, el globo va en el diálogo
    const container = host.closest('dialog[open]') ?? document.body;
    if (tip.parentElement !== container) {
      tip.classList.remove('oj-tooltip--visible', 'oj-tooltip--moving');
      container.appendChild(tip);
    }
    // Si ya estaba visible para otro elemento, se desliza hasta el nuevo en vez de aparecer otro
    tip.classList.toggle('oj-tooltip--moving', tip.classList.contains('oj-tooltip--visible') && this.owner !== host);
    this.owner = host;
    tip.textContent = text;
    tip.classList.add('oj-tooltip--visible');
    this.place(host, tip);
  }

  // Un respiro antes de ocultar: si el mouse llega a otro elemento con tooltip, el globo solo se mueve
  hide(host: HTMLElement): void {
    if (this.owner !== host) return;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.el?.classList.remove('oj-tooltip--visible', 'oj-tooltip--moving');
      this.owner = null;
    }, 80);
  }

  release(host: HTMLElement): void {
    if (this.owner !== host) return;
    this.el?.classList.remove('oj-tooltip--visible', 'oj-tooltip--moving');
    this.owner = null;
  }

  private ensure(): HTMLElement {
    if (this.el) return this.el;
    const tip = document.createElement('div');
    tip.className = 'oj-tooltip';
    // Lo que dice ya lo anuncia el aria-describedby de cada elemento
    tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    // Con scroll el globo quedaría en otro lugar: se oculta
    window.addEventListener('scroll', () => this.owner && this.release(this.owner), { capture: true, passive: true });
    return (this.el = tip);
  }

  // Arriba y centrado; abajo si no cabe; pegado al borde de la ventana cerca de él
  private place(host: HTMLElement, tip: HTMLElement): void {
    const { width, height } = tip.getBoundingClientRect();
    const rect = host.getBoundingClientRect();
    const margin = 8;
    const viewport = document.documentElement.clientWidth;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), viewport - width - margin);
    const above = rect.top - height - 6;
    tip.style.left = left + 'px';
    tip.style.top = (above >= margin ? above : rect.bottom + 6) + 'px';
  }
})();
