import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IStandingsCell } from '@concurso/shared-types';

// Celda del marcador ICPC (pantalla 12). Resuelto: "+intentos · minuto" (verde); intentado sin
// resolver: "−intentos" (rojo); pendiente: "? intentos" (ámbar); sin intentos: vacía y sin borde.
@Component({
  selector: 'oj-standings-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="oj-sc oj-sc--{{ view().kind }}" [class.oj-sc--grande]="size() === 'grande'">{{ view().text }}</span>`,
  styles: `
    .oj-sc {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 64px;
      padding: 2px 6px;
      border: 1px solid transparent;
      border-radius: var(--oj-radius);
      font-family: var(--oj-font-mono);
      font-size: 12px;
      font-weight: 600;
    }
    .oj-sc--solved {
      background: var(--oj-success-bg);
      border-color: var(--oj-success);
      color: var(--oj-success);
    }
    .oj-sc--rejected {
      border-color: var(--oj-danger);
      color: var(--oj-danger);
    }
    .oj-sc--pending {
      border-color: var(--oj-warning);
      color: var(--oj-warning);
    }
    .oj-sc--empty {
      border-color: transparent;
    }
    .oj-sc--grande {
      min-width: 96px;
      padding: 6px 12px;
      font-size: 18px;
    }
  `,
})
export class StandingsCell {
  readonly cell = input<IStandingsCell | null>();
  readonly size = input<'normal' | 'grande'>('normal');

  protected readonly view = computed<{ kind: string; text: string }>(() => {
    const c = this.cell();
    if (!c || (!c.solved && c.rejected === 0 && c.pending === 0)) return { kind: 'empty', text: '' };
    if (c.solved) return { kind: 'solved', text: `+${c.rejected + 1} · ${c.acMinute}` };
    if (c.pending > 0) return { kind: 'pending', text: `? ${c.rejected + c.pending}` };
    return { kind: 'rejected', text: `−${c.rejected}` };
  });
}
