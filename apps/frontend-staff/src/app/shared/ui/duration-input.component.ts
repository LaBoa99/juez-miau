import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Duración en horas y minutos. HTML no tiene un control de duración (<input type="time"> es una hora
// del reloj, tope 23:59). El valor del formulario es el total en minutos; null si los dos están vacíos.
@Component({
  selector: 'oj-duration-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DurationInput), multi: true }],
  template: `
    <input
      [id]="inputId()"
      class="oj-mono"
      type="number"
      min="0"
      inputmode="numeric"
      aria-label="Horas"
      [value]="hours()"
      [disabled]="disabled()"
      (input)="onHours($any($event.target).value)"
      (blur)="onTouched()"
    />
    <span class="oj-dur__unit" aria-hidden="true">h</span>
    <input
      class="oj-mono"
      type="number"
      min="0"
      max="59"
      inputmode="numeric"
      aria-label="Minutos"
      [value]="minutes()"
      [disabled]="disabled()"
      (input)="onMinutes($any($event.target).value)"
      (blur)="onTouched()"
    />
    <span class="oj-dur__unit" aria-hidden="true">min</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--oj-space-sm);
    }
    input {
      width: 5rem;
    }
    .oj-dur__unit {
      font-size: 13px;
      color: var(--oj-text-muted);
    }
  `,
})
export class DurationInput implements ControlValueAccessor {
  // id del campo de horas, para el <label for> de oj-form-field
  readonly inputId = input<string>();

  protected readonly hours = signal<number | ''>('');
  protected readonly minutes = signal<number | ''>('');
  protected readonly disabled = signal(false);

  private onChange: (v: number | null) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(totalMin: number | null): void {
    if (totalMin == null) {
      this.hours.set('');
      this.minutes.set('');
      return;
    }
    this.hours.set(Math.floor(totalMin / 60));
    this.minutes.set(totalMin % 60);
  }
  registerOnChange(fn: (v: number | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }

  protected onHours(raw: string): void {
    this.hours.set(toNumber(raw));
    this.emit();
  }
  protected onMinutes(raw: string): void {
    this.minutes.set(toNumber(raw));
    this.emit();
  }

  private emit(): void {
    const h = this.hours();
    const m = this.minutes();
    this.onChange(h === '' && m === '' ? null : durationMinutes(h, m));
  }
}

function toNumber(raw: string): number | '' {
  return raw === '' ? '' : Number(raw);
}

// Total en minutos; un campo vacío cuenta como 0 (ej. "2 h" sin minutos = 120).
export function durationMinutes(hours: number | '', minutes: number | ''): number {
  return Number(hours || 0) * 60 + Number(minutes || 0);
}
