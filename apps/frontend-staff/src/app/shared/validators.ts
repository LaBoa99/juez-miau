import { ValidationErrors, ValidatorFn } from '@angular/forms';

// Mensaje del primer error de un control. Un error con texto (withMessage) usa ese texto;
// los de Angular usan el mensaje por defecto de su clave.
export function errorMessage(errors: ValidationErrors | null): string | undefined {
  if (!errors) return undefined;
  const [key, value] = Object.entries(errors)[0];
  if (typeof value === 'string') return value;
  switch (key) {
    case 'required':
      return 'Este campo es obligatorio.';
    case 'email':
      return 'Escribe un correo válido.';
    case 'minlength':
      return `Mínimo ${value.requiredLength} caracteres.`;
    case 'maxlength':
      return `Máximo ${value.requiredLength} caracteres.`;
    case 'min':
      return `Debe ser al menos ${value.min}.`;
    case 'max':
      return `Debe ser como máximo ${value.max}.`;
    case 'pattern':
      return 'Formato inválido.';
    default:
      return 'Valor inválido.';
  }
}

// Mismo validator, pero su error lleva un mensaje propio.
export function withMessage(validator: ValidatorFn, message: string): ValidatorFn {
  return (control) => {
    const errors = validator(control);
    return errors ? Object.fromEntries(Object.keys(errors).map((k) => [k, message])) : null;
  };
}
