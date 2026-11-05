import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { errorMessage, withMessage } from './validators';
import { FormField } from './ui/form-field.component';

describe('errorMessage', () => {
  it('default messages by error key', () => {
    expect(errorMessage(null)).toBeUndefined();
    expect(errorMessage(Validators.required(new FormControl('')))).toBe('Este campo es obligatorio.');
    expect(errorMessage(Validators.minLength(8)(new FormControl('abc')))).toBe('Mínimo 8 caracteres.');
    expect(errorMessage(Validators.min(1)(new FormControl(0)))).toBe('Debe ser al menos 1.');
  });
  it('withMessage carries its own text', () => {
    const v = withMessage(Validators.required, 'Elige un usuario.');
    expect(errorMessage(v(new FormControl(null)))).toBe('Elige un usuario.');
    expect(v(new FormControl(3))).toBeNull();
  });
});

@Component({
  imports: [ReactiveFormsModule, FormField],
  template: `
    <oj-form-field label="A" for="a" hint="pista"><input id="a" [formControl]="a" /></oj-form-field>
    <oj-form-field label="B" for="b" [error]="explicit"><input id="b" [formControl]="b" /></oj-form-field>
  `,
})
class Host {
  a = new FormControl('', Validators.minLength(8));
  b = new FormControl('', Validators.required);
  explicit = 'Mensaje propio';
}

describe('FormField', () => {
  it('shows the control error once touched, and an explicit [error] wins', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text()).toContain('pista');
    expect(text()).toContain('Mensaje propio');

    fixture.componentInstance.a.setValue('abc');
    fixture.componentInstance.a.markAsTouched();
    await fixture.whenStable();
    expect(text()).toContain('Mínimo 8 caracteres.');
    expect(text()).not.toContain('pista');
  });
});
