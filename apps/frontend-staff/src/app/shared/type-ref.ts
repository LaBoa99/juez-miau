import { IProblemSignature, ScalarType, TypeRef } from '@concurso/shared-types';

export const SCALAR_TYPES: ScalarType[] = ['int', 'long', 'float', 'bool', 'string'];
export const MAX_ARRAY_DEPTH = 3;

// "int", "int[]", "int[][]" — igual que typeToString del backend.
export function typeToString(type: TypeRef): string {
  return type.type === 'array' ? typeToString(type.items) + '[]' : type.type;
}

export function signatureToString(sig: IProblemSignature): string {
  const params = sig.params.map((p) => `${p.name}: ${typeToString(p.type)}`).join(', ');
  return `${sig.functionName}(${params}) -> ${typeToString(sig.returns)}`;
}

// TypeRef <-> {base escalar, profundidad de arreglo} para el editor.
export function typeToUi(type: TypeRef): { base: ScalarType; depth: number } {
  let depth = 0;
  let t: TypeRef = type;
  while (t.type === 'array') {
    depth++;
    t = t.items;
  }
  return { base: t.type, depth };
}

export function uiToType(base: ScalarType, depth: number): TypeRef {
  let t: TypeRef = { type: base };
  for (let i = 0; i < depth; i++) t = { type: 'array', items: t };
  return t;
}

// El escalar base de un tipo (para decidir el control del caso manual).
export function scalarBase(type: TypeRef): ScalarType {
  return typeToUi(type).base;
}

export function isArrayType(type: TypeRef): boolean {
  return type.type === 'array';
}
