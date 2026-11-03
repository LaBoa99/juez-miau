import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { PageHeader } from '../../shared/ui/page-header.component';

@Component({
  selector: 'oj-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonDirective, EmptyState, PageHeader],
  template: `
    <oj-page-header title="Página no encontrada" />
    <oj-empty-state message="La dirección no existe o cambió.">
      <a ojButton variant="secondary" routerLink="/ediciones">Volver a Ediciones</a>
    </oj-empty-state>
  `,
})
export class NotFound {}
