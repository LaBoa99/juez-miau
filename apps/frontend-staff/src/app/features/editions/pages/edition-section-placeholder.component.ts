import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../../shared/ui/empty-state.component';

@Component({
  selector: 'oj-edition-section-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `<oj-empty-state message="En construcción" />`,
})
export class EditionSectionPlaceholder {}
