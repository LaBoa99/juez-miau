import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../../../shared/ui/empty-state.component';

// Placeholder del detalle de envío (paso 17B).
@Component({
  selector: 'oj-submission-detail-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `<oj-empty-state message="El detalle del envío llega en el paso 17B." />`,
})
export class SubmissionDetailPlaceholder {}
