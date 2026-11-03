import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '../../shared/ui/page-header.component';

@Component({
  selector: 'oj-credits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader],
  template: `
    <oj-page-header title="Créditos" />
    <section class="credits">
      <img class="credits__logo" src="assets/logos/gatito.svg" alt="Logo del Juez Virtual: gatito detective" />
      <h2 class="credits__title">Juez Virtual · CUValles</h2>
      <p class="credits__label">Versión 1.0</p>
      <p class="credits__label">Desarrollado por</p>
      <ul class="credits__authors">
        <li>Ing. Gael Rodríguez</li>
        <li>Ing. Maribel Navarro</li>
      </ul>
    </section>
  `,
  styles: `
    .credits {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--oj-space-md);
      padding: var(--oj-space-xl) 0;
      text-align: center;
    }
    .credits__logo {
      width: 240px;
      height: 240px;
    }
    .credits__title {
      margin: 0;
      font-size: 20px;
    }
    .credits__label {
      margin: 0;
      font-size: 13px;
      color: var(--oj-text-muted);
    }
    .credits__authors {
      margin: 0;
      padding: 0;
      list-style: none;
      line-height: 1.75;
    }
  `,
})
export class Credits {}
