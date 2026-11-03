import { Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';

let nextId = 0;

// Texto de ayuda al pasar el mouse o al enfocar con teclado. El texto vive dentro del elemento
// (span.oj-tooltip) y se enlaza con aria-describedby; estilos en shared/styles/tooltip.css.
// Si el elemento no es enfocable por sí mismo, recibe tabindex=0 para que el teclado llegue.
@Directive({
  selector: '[ojTooltip]',
  host: {
    class: 'oj-tooltip-host',
    '[attr.aria-describedby]': 'id',
    '[attr.tabindex]': 'focusable ? null : 0',
    '(mouseenter)': 'place()',
    '(focusin)': 'place()',
  },
})
export class TooltipDirective {
  readonly ojTooltip = input.required<string>();

  protected readonly id = 'oj-tooltip-' + nextId++;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly focusable = this.el.matches('a[href], button, input, select, textarea, [tabindex]');

  private readonly tip: HTMLElement;

  constructor() {
    const renderer = inject(Renderer2);
    const tip: HTMLElement = (this.tip = renderer.createElement('span'));
    renderer.addClass(tip, 'oj-tooltip');
    renderer.setAttribute(tip, 'role', 'tooltip');
    renderer.setAttribute(tip, 'id', this.id);
    renderer.appendChild(this.el, tip);
    effect(() => renderer.setProperty(tip, 'textContent', this.ojTooltip()));
  }

  // Cerca de un borde de la ventana el globo se alinea a ese borde en vez de centrarse
  protected place(): void {
    const host = this.el.getBoundingClientRect();
    const half = Math.min(240, this.tip.scrollWidth || 240) / 2;
    const center = host.left + host.width / 2;
    this.tip.classList.toggle('oj-tooltip--end', center + half > document.documentElement.clientWidth - 8);
    this.tip.classList.toggle('oj-tooltip--start', center - half < 8);
  }
}
