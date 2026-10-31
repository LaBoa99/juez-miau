import { Directive, computed, input } from '@angular/core';

@Directive({
  selector: 'button[ojButton], a[ojButton]',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class ButtonDirective {
  readonly variant = input<'primary' | 'secondary' | 'danger' | 'danger-outline' | 'success' | 'warning'>('secondary');
  readonly size = input<'sm' | 'md'>('md');

  protected readonly hostClasses = computed(
    () => `oj-btn oj-btn--${this.variant()} oj-btn--${this.size()}`,
  );
}
