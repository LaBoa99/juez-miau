import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IStandingsCell } from '@concurso/shared-types';

type Kind = 'solved' | 'failed' | 'pending' | 'empty';

// Caja de problema del marcador: encabezado de color con la letra y cuerpo con el resultado.
// Resuelto "+N" (verde, con gato), intentos fallidos "−N" (ámbar), pendiente "?N" (ámbar punteado),
// sin intentos "·" (gris claro). "grande" es para el proyector (se lee a distancia).
@Component({
  selector: 'oj-standings-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'oj-sc oj-sc--' + view().kind + (size() === 'grande' ? ' oj-sc--grande' : '')" },
  template: `
    <span class="oj-sc__head">
      @if (view().kind === 'solved') {
        <svg class="oj-sc__cat" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 1.5 6 5h4l3.5-3.5V9a5.5 5.5 0 0 1-11 0z" />
          <circle class="oj-sc__eye" cx="6" cy="8.5" r="1" />
          <circle class="oj-sc__eye" cx="10" cy="8.5" r="1" />
        </svg>
      }
      {{ letter() }}
    </span>
    <span class="oj-sc__body oj-mono" [attr.aria-label]="view().label" [title]="view().label">{{ view().text }}</span>
  `,
  styles: `
    :host {
      --sc-tone: var(--oj-border);
      --sc-ink: var(--oj-text-muted);
      --sc-bg: var(--oj-bg);
      display: inline-flex;
      flex-direction: column;
      min-width: 44px;
      overflow: hidden;
      border: 1px solid var(--sc-tone);
      border-radius: 6px;
      background: var(--sc-bg);
      font-family: var(--oj-font-mono);
      line-height: 1;
      vertical-align: middle;
    }
    :host(.oj-sc--solved) {
      --sc-tone: var(--oj-success);
      --sc-ink: var(--oj-success);
      --sc-bg: var(--oj-success-bg);
    }
    :host(.oj-sc--failed),
    :host(.oj-sc--pending) {
      --sc-tone: var(--oj-warning);
      --sc-ink: var(--oj-warning);
      --sc-bg: var(--oj-warning-bg);
    }
    :host(.oj-sc--pending) {
      border-style: dashed;
    }
    .oj-sc__head {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 2px 4px;
      background: var(--sc-tone);
      color: var(--oj-bg);
      font-size: 10px;
      font-weight: 700;
    }
    :host(.oj-sc--empty) .oj-sc__head {
      background: var(--oj-neutral-bg);
      color: var(--oj-text-muted);
    }
    .oj-sc__cat {
      width: 10px;
      height: 10px;
      fill: currentColor;
    }
    .oj-sc__eye {
      fill: var(--sc-tone);
    }
    .oj-sc__body {
      padding: 3px 4px;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      color: var(--sc-ink);
    }

    /* Proyector */
    :host(.oj-sc--grande) {
      min-width: 76px;
      border-width: 2px;
    }
    :host(.oj-sc--grande) .oj-sc__head {
      gap: 4px;
      padding: 4px 6px;
      font-size: 18px;
    }
    :host(.oj-sc--grande) .oj-sc__cat {
      width: 16px;
      height: 16px;
    }
    :host(.oj-sc--grande) .oj-sc__body {
      padding: 6px;
      font-size: 24px;
    }
  `,
})
export class StandingsCell {
  readonly cell = input<IStandingsCell | null>();
  readonly letter = input('');
  readonly size = input<'normal' | 'grande'>('normal');

  protected readonly view = computed<{ kind: Kind; text: string; label: string }>(() => {
    const c = this.cell();
    if (!c || (!c.solved && c.rejected === 0 && c.pending === 0)) return { kind: 'empty', text: '·', label: 'Sin intentos' };
    if (c.solved) {
      const tries = c.rejected + 1;
      return { kind: 'solved', text: `+${tries}`, label: `Resuelto en el minuto ${c.acMinute} (${tries} ${tries === 1 ? 'intento' : 'intentos'})` };
    }
    if (c.pending > 0) {
      const n = c.rejected + c.pending;
      return { kind: 'pending', text: `?${n}`, label: `${c.pending} sin veredicto visible (${n} ${n === 1 ? 'intento' : 'intentos'})` };
    }
    return { kind: 'failed', text: `−${c.rejected}`, label: `${c.rejected} ${c.rejected === 1 ? 'intento fallido' : 'intentos fallidos'}` };
  });
}
