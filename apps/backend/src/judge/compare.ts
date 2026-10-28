import { CompareMode, type TypeRef } from '@concurso/shared-types'
import { parseJsonPreservingIntegers, serializeValue } from '../testsets/generation/canonical-json.js'
import { normalizeValue } from '../testsets/generation/signature.js'

export const DEFAULT_FLOAT_TOLERANCE = 1e-6

export type NormalizedOutput =
    | { ok: true, canonical: string }
    | { ok: false, message: string }

// El driver escribe JSON válido pero no canónico (5 en vez de 5.0, long como string en JS).
// Se revisa contra el tipo de retorno y se reescribe en forma canónica
export function normalizeOutput(returns: TypeRef, text: string): NormalizedOutput {
    let parsed: unknown
    try {
        parsed = parseJsonPreservingIntegers(text)
    } catch {
        return { ok: false, message: 'the result is not valid JSON (NaN or Infinity?)' }
    }

    const errors: string[] = []
    const value = normalizeValue(returns, parsed, 'result', errors)
    if(errors.length > 0){
        return { ok: false, message: errors.slice(0, 3).join('; ') }
    }
    return { ok: true, canonical: serializeValue(returns, value) }
}

export function outputsMatch(
    returns: TypeRef,
    actual: string,
    expected: string,
    mode: CompareMode,
    tolerance: number | null,
): boolean {
    if(actual === expected) return true
    if(mode !== CompareMode.TOLERANCE) return false

    return valuesMatch(
        returns,
        parseJsonPreservingIntegers(actual),
        parseJsonPreservingIntegers(expected),
        tolerance ?? DEFAULT_FLOAT_TOLERANCE,
    )
}

// Un float pasa si el error absoluto o el relativo está dentro de la tolerancia
function valuesMatch(type: TypeRef, actual: unknown, expected: unknown, tolerance: number): boolean {
    switch(type.type){
        case 'float': {
            const a = actual as number
            const b = expected as number
            const diff = Math.abs(a - b)
            return diff <= tolerance || diff <= tolerance * Math.abs(b)
        }
        case 'array': {
            const a = actual as unknown[]
            const b = expected as unknown[]
            return a.length === b.length && a.every((item, index) => valuesMatch(type.items, item, b[index], tolerance))
        }
        default:
            return actual === expected
    }
}
