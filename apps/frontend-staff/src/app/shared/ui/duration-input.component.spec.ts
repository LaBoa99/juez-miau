import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DurationInput, durationMinutes } from './duration-input.component';

describe('oj-duration-input', () => {
  it('suma horas y minutos; un campo vacío cuenta como 0', () => {
    expect(durationMinutes(2, 30)).toBe(150);
    expect(durationMinutes(2, '')).toBe(120);
    expect(durationMinutes('', 45)).toBe(45);
  });

  it('reparte el valor del formulario en horas y minutos y devuelve el total', () => {
    const c = TestBed.createComponent(DurationInput).componentInstance;
    let last: number | null | undefined;
    c.registerOnChange((v) => (last = v));
    c.writeValue(195);
    expect([c['hours'](), c['minutes']()]).toEqual([3, 15]);
    c['onMinutes']('0');
    expect(last).toBe(180);
    c['onHours']('');
    c['onMinutes']('');
    expect(last).toBeNull();
  });
});
