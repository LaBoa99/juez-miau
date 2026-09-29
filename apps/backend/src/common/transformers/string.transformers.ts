import type { TransformFnParams } from 'class-transformer';

// Helpers para @Transform: si el valor no es string lo devuelven tal cual
// para que class-validator reporte el error de tipo.

// Quita espacios al inicio/fin y colapsa los espacios internos repetidos
export const trim = ({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

// trim + minúsculas
export const trimLower = (params: TransformFnParams) => {
    const value = trim(params);
    return typeof value === 'string' ? value.toLowerCase() : value;
};

// Extensión de archivo: ".CPP " -> "cpp"
export const fileExtension = (params: TransformFnParams) => {
    const value = trimLower(params);
    return typeof value === 'string' ? value.replace(/^\.+/, '').replace(/\s/g, '') : value;
};
