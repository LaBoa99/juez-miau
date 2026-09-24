import type { ValueTransformer } from 'typeorm';

// pg devuelve las columnas bigint como string; las convertimos a number al leer
export const bigintTransformer: ValueTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
