import type { IProblemSignature, TypeRef } from '@concurso/shared-types'

// JSON canónico: los mismos datos producen siempre los mismos bytes, en cualquier lenguaje.
// - Las llaves del input van en el orden de los parámetros de la firma.
// - Los float siempre llevan parte decimal o exponente (5 → 5.0).
// - Los long se escriben como entero completo, sin pasar por double.
// Los valores deben venir normalizados (ver `normalizeValue`): los long como bigint.

export function serializeValue(type: TypeRef, value: unknown): string {
    switch(type.type){
        case 'int':
            return String(value as number)
        case 'long':
            return (value as bigint).toString()
        case 'float':
            return formatFloat(value as number)
        case 'bool':
            return value ? 'true' : 'false'
        case 'string':
            return JSON.stringify(value as string)
        case 'array':
            return '[' + (value as unknown[]).map((item) => serializeValue(type.items, item)).join(',') + ']'
    }
}

export function serializeInput(signature: IProblemSignature, input: Record<string, unknown>): string {
    const fields = signature.params.map((param) => JSON.stringify(param.name) + ':' + serializeValue(param.type, input[param.name]))
    return '{' + fields.join(',') + '}'
}

function formatFloat(value: number): string {
    // -0 y 0 se comparan igual; se escribe uno solo
    const text = String(Object.is(value, -0) ? 0 : value)
    return /[.eE]/.test(text) ? text : text + '.0'
}

// JSON.parse que conserva como string los enteros que no caben en un double sin perder
// precisión, para que `normalizeValue` los acepte como long
export function parseJsonPreservingIntegers(text: string): unknown {
    return JSON.parse(text, function (_key, value: unknown, context?: { source?: string }) {
        if(typeof value === 'number' && !Number.isSafeInteger(value) && context?.source && /^-?\d+$/.test(context.source)){
            return context.source
        }
        return value
    })
}
