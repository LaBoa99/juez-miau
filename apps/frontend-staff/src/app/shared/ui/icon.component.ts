import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName = 'view' | 'edit' | 'delete' | 'download' | 'remove';

// Trazos de 16×16 con línea de 1.4 (los mismos del editor de casos). Siempre decorativo: el botón que lo
// contiene lleva aria-label y ojTooltip con el nombre de la acción.
@Component({
  selector: 'oj-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('view') { <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /> }
        @case ('edit') { <path d="M11 2l3 3-8.5 8.5H2.5v-3L11 2z" /> }
        @case ('delete') { <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v5M9.5 6.5v5" /> }
        @case ('download') { <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" /> }
        @case ('remove') { <circle cx="6" cy="5" r="2.5" /><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M10.5 7.5h4" /> }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
    }
    svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
}
