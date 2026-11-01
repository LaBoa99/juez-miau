import { ISchemaGroup, ITestsetSchema, SchemaNode, TypeRef } from '@concurso/shared-types';

// Rangos de un parámetro tal como los edita el juez (texto, para validarlos al guardar).
export type RandomNode =
  | { type: 'int' | 'long'; min: string; max: string }
  | { type: 'float'; min: string; max: string; decimals: string }
  | { type: 'bool' }
  | { type: 'string'; lenMin: string; lenMax: string; charset: string }
  | { type: 'array'; lenMin: string; lenMax: string; unique: boolean; sorted: '' | 'asc' | 'desc'; items: RandomNode };

// Un grupo = N casos con los mismos rangos. Las semillas las pone el sistema.
export interface RandomGroup {
  name: string;
  count: string;
  params: Record<string, RandomNode>;
}

export function defaultNode(type: TypeRef): RandomNode {
  switch (type.type) {
    case 'array': return { type: 'array', lenMin: '1', lenMax: '10', unique: false, sorted: '', items: defaultNode(type.items) };
    case 'string': return { type: 'string', lenMin: '1', lenMax: '10', charset: 'a-z' };
    case 'float': return { type: 'float', min: '0', max: '100', decimals: '2' };
    case 'bool': return { type: 'bool' };
    default: return { type: type.type, min: '1', max: '100' };
  }
}

const str = (v: unknown, fallback: string) => (v === undefined || v === null ? fallback : String(v));

// Nodo del backend -> nodo editable (lo que falte o no coincida con la firma toma el valor por defecto).
function toRandom(type: TypeRef, node: Partial<SchemaNode> | undefined): RandomNode {
  const d = defaultNode(type);
  if (!node || node.type !== d.type) return d;
  const n = node as Record<string, unknown>;
  const len = n['length'] as [number, number] | undefined;
  switch (d.type) {
    case 'array':
      return {
        ...d, lenMin: str(len?.[0], d.lenMin), lenMax: str(len?.[1], d.lenMax), unique: n['unique'] === true,
        sorted: (n['sorted'] as 'asc' | 'desc' | undefined) ?? '',
        items: toRandom((type as { items: TypeRef }).items, n['items'] as Partial<SchemaNode>),
      };
    case 'string': return { ...d, lenMin: str(len?.[0], d.lenMin), lenMax: str(len?.[1], d.lenMax), charset: str(n['charset'], d.charset) };
    case 'float': return { ...d, min: str(n['min'], d.min), max: str(n['max'], d.max), decimals: str(n['decimals'], d.decimals) };
    case 'bool': return d;
    default: return { ...d, min: str(n['min'], d.min), max: str(n['max'], d.max) };
  }
}

// Igual que mergeNode del backend: objetos se combinan, arreglos y escalares se reemplazan.
function merge(base: unknown, override: unknown): unknown {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isObj(base) || !isObj(override)) return override === undefined ? base : override;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = merge(base[k], v);
  return out;
}

export function schemaToGroups(schema: ITestsetSchema | null, params: { name: string; type: TypeRef }[]): RandomGroup[] {
  if (!schema || schema.groups.length === 0) {
    return [{ name: 'aleatorios', count: '5', params: Object.fromEntries(params.map((p) => [p.name, defaultNode(p.type)])) }];
  }
  return schema.groups.map((g) => ({
    name: g.name,
    count: String(g.seeds.length),
    params: Object.fromEntries(
      params.map((p) => [p.name, toRandom(p.type, merge(schema.params[p.name], g.overrides?.[p.name]) as Partial<SchemaNode>)]),
    ),
  }));
}

const INTEGER = /^-?\d+$/;

function lengthPair(node: { lenMin: string; lenMax: string }, label: string, errors: string[]): [number, number] {
  const min = Number(node.lenMin);
  const max = Number(node.lenMax);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0) {
    errors.push(`${label}: la longitud debe ser un entero de 0 en adelante.`);
  } else if (min > max) {
    errors.push(`${label}: la longitud mínima no puede ser mayor que la máxima.`);
  }
  return [min, max];
}

// Nodo editable -> nodo del backend. Junta en `errors` lo que esté mal, con el nombre del parámetro.
function fromRandom(node: RandomNode, label: string, errors: string[]): SchemaNode {
  switch (node.type) {
    case 'int':
    case 'long': {
      const ok = INTEGER.test(node.min.trim()) && INTEGER.test(node.max.trim());
      if (!ok) errors.push(`${label}: mínimo y máximo deben ser enteros.`);
      else if (BigInt(node.min.trim()) > BigInt(node.max.trim())) errors.push(`${label}: el mínimo no puede ser mayor que el máximo.`);
      // Fuera de ±2^53 se manda como texto (lo acepta el backend para long)
      const val = (v: string) => (ok && Number.isSafeInteger(Number(v)) ? Number(v) : v.trim());
      return { type: node.type, min: val(node.min), max: val(node.max) };
    }
    case 'float': {
      const min = Number(node.min);
      const max = Number(node.max);
      const decimals = Number(node.decimals);
      if (node.min.trim() === '' || node.max.trim() === '' || !Number.isFinite(min) || !Number.isFinite(max)) {
        errors.push(`${label}: mínimo y máximo deben ser números.`);
      } else if (min > max) errors.push(`${label}: el mínimo no puede ser mayor que el máximo.`);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) errors.push(`${label}: los decimales van de 0 a 12.`);
      return { type: 'float', min, max, decimals };
    }
    case 'bool':
      return { type: 'bool' };
    case 'string':
      if (!node.charset.trim()) errors.push(`${label}: indica los caracteres permitidos, p. ej. a-z0-9.`);
      return { type: 'string', length: lengthPair(node, label, errors), charset: node.charset };
    case 'array':
      return {
        type: 'array',
        length: lengthPair(node, label, errors),
        items: fromRandom(node.items, `${label} (elementos)`, errors),
        ...(node.unique && { unique: true }),
        ...(node.sorted && { sorted: node.sorted }),
      };
  }
}

// Grupos editables -> esquema del backend. Cada grupo lleva sus rangos completos como overrides;
// las semillas se numeran 1..N entre todos los grupos.
export function groupsToSchema(groups: RandomGroup[], paramNames: string[]): { schema: ITestsetSchema; errors: string[]; total: number } {
  const errors: string[] = [];
  const names = groups.map((g) => g.name.trim());
  if (names.some((n) => !n)) errors.push('Cada grupo necesita un nombre.');
  const dup = names.find((n, i) => n && names.indexOf(n) !== i);
  if (dup) errors.push(`El grupo "${dup}" está repetido. Usa nombres distintos.`);

  let seed = 0;
  const out: ISchemaGroup[] = groups.map((g, gi) => {
    const count = Number(g.count);
    if (!Number.isInteger(count) || count < 1) errors.push(`Grupo "${names[gi] || gi + 1}": la cantidad de casos debe ser un entero de 1 en adelante.`);
    const seeds = Array.from({ length: Number.isInteger(count) && count > 0 ? count : 0 }, () => ++seed);
    const overrides = Object.fromEntries(
      paramNames.map((p) => [p, fromRandom(g.params[p], `Grupo "${names[gi] || gi + 1}", ${p}`, errors)]),
    ) as ISchemaGroup['overrides'];
    return { name: names[gi], seeds, overrides };
  });

  const params = (out[0]?.overrides ?? {}) as Record<string, SchemaNode>;
  return { schema: { params, groups: out }, errors, total: seed };
}
