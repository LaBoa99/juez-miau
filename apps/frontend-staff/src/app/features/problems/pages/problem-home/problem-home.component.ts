import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonDirective } from '../../../../shared/ui/button.directive';
import { EmptyState } from '../../../../shared/ui/empty-state.component';
import { ProblemsBus } from '../../data/problems-bus';

@Component({
  selector: 'oj-problem-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, EmptyState],
  template: `
    @if (bus.problems().length === 0) {
      <oj-empty-state message="Aún no hay problemas. Crea el primero.">
        <button ojButton variant="secondary" type="button" (click)="nuevo()">Nuevo problema</button>
      </oj-empty-state>
    } @else {
      <p class="home__hint">Selecciona un problema de la lista.</p>
    }
  `,
  styles: `
    .home__hint {
      margin: 0;
      font-size: 13px;
      color: var(--oj-text-muted);
    }
  `,
})
export class ProblemHome {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly bus = inject(ProblemsBus);

  nuevo(): void {
    this.router.navigate(['nuevo'], { relativeTo: this.route.parent });
  }
}
