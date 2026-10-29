import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '../../../shared/ui/page-header.component';
import { EmptyState } from '../../../shared/ui/empty-state.component';

@Component({
  selector: 'oj-editions-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, EmptyState],
  template: `
    <oj-page-header title="Ediciones" />
    <oj-empty-state message="En construcción" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--oj-space-lg);
    }
  `,
})
export class EditionsPlaceholder {}
