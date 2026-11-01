import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { EmptyState } from '../../shared/ui/empty-state.component';
import { PageHeader } from '../../shared/ui/page-header.component';

@Component({
  selector: 'oj-forbidden',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonDirective, EmptyState, PageHeader],
  template: `
    <oj-page-header title="Sin acceso" />
    <oj-empty-state message="No tienes permiso para ver esta sección.">
      <a ojButton variant="secondary" routerLink="/ediciones">Volver a Ediciones</a>
    </oj-empty-state>
  `,
})
export class Forbidden {}
