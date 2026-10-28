import type { IArraySchemaNode, IFloatSchemaNode, IIntegerSchemaNode, IProblemSignature, IStringSchemaNode, ITestsetSchema, SchemaNode, TypeRef } from '@concurso/shared-types'
import { serializeInput, serializeValue } from './canonical-json.js'
import { MAX_CASE_BYTES } from './limits.js'
import { Prng } from './prng.js'
import { expandCharset, integerBounds, resolveGroupNodes } from './schema.js'

export class GenerationError extends Error {}

export interface GeneratedCase {
    group: string
    seed: number
    // JSON canónico del input
    text: string
}

// Una entrada por semilla de cada grupo, en orden. Asume firma y esquema ya validados.
// Es un iterador para no tener todos los casos en memoria a la vez
export function* generateCases(signature: IProblemSignature, schema: ITestsetSchema): Generator<GeneratedCase> {
    for(const group of schema.groups){
        const nodes = resolveGroupNodes(schema, group)

        for(const seed of group.seeds){
            const prng = Prng.fromKey(group.name + ':' + seed)
            const input: Record<string, unknown> = {}
            for(const param of signature.params){
                input[param.name] = generateValue(prng, param.type, nodes[param.name], group.name + '/' + seed + ' ' + param.name)
            }

            const text = serializeInput(signature, input)
            if(Buffer.byteLength(text) > MAX_CASE_BYTES){
                throw new GenerationError('case ' + group.name + '/' + seed + ' is larger than ' + MAX_CASE_BYTES + ' bytes')
            }

            yield { group: group.name, seed, text }
        }
    }
}

export function generateValue(prng: Prng, type: TypeRef, node: SchemaNode, path: string): unknown {
    switch(type.type){
        case 'int': {
            const [min, max] = integerBounds(node as IIntegerSchemaNode)
            return prng.int(Number(min), Number(max))
        }
        case 'long': {
            const [min, max] = integerBounds(node as IIntegerSchemaNode)
            return prng.bigint(min, max)
        }
        case 'float':
            return generateFloat(prng, node as IFloatSchemaNode)
        case 'bool':
            return prng.below(2) === 1
        case 'string': {
            const { length, charset } = node as IStringSchemaNode
            const chars = expandCharset(charset!)!
            const size = prng.int(length![0], length![1])
            let text = ''
            for(let i = 0; i < size; i++) text += chars[prng.below(chars.length)]
            return text
        }
        case 'array':
            return generateArray(prng, type.items, node as IArraySchemaNode, path)
    }
}

function generateFloat(prng: Prng, node: IFloatSchemaNode): number {
    const min = node.min!
    const max = node.max!
    let value = min + prng.float() * (max - min)

    if(node.decimals !== undefined){
        const factor = 10 ** node.decimals
        value = Math.round(value * factor) / factor
    }
    return Math.min(max, Math.max(min, value))
}

function generateArray(prng: Prng, items: TypeRef, node: IArraySchemaNode, path: string): unknown[] {
    const length = prng.int(node.length![0], node.length![1])
    const itemNode = node.items!

    let values: unknown[]
    if(!node.unique){
        values = Array.from({ length }, () => generateValue(prng, items, itemNode, path + '[]'))
    } else if(items.type === 'int' || items.type === 'long'){
        values = uniqueIntegers(prng, items.type, itemNode as IIntegerSchemaNode, length)
    } else {
        values = uniqueByRetry(prng, items, itemNode, length, path)
    }

    if(node.sorted){
        values.sort(compareScalars)
        if(node.sorted === 'desc') values.reverse()
    }
    return values
}

// Muestreo sin reemplazo con el algoritmo de Floyd: O(length) sin importar el tamaño del rango
function uniqueIntegers(prng: Prng, type: 'int' | 'long', node: IIntegerSchemaNode, length: number): unknown[] {
    const [min, max] = integerBounds(node)
    const range = max - min + 1n
    const chosen = new Set<bigint>()

    for(let j = range - BigInt(length); j < range; j++){
        const t = prng.bigint(0n, j)
        chosen.add(chosen.has(t) ? j : t)
    }

    const values = [...chosen].map((offset) => type === 'int' ? Number(min + offset) : min + offset)
    return prng.shuffle(values)
}

// Para float, bool, string y arrays: se descartan repetidos hasta un número de intentos
function uniqueByRetry(prng: Prng, items: TypeRef, node: SchemaNode, length: number, path: string): unknown[] {
    const seen = new Set<string>()
    const values: unknown[] = []
    let attempts = 0
    const maxAttempts = length * 20 + 100

    while(values.length < length){
        if(++attempts > maxAttempts){
            throw new GenerationError(path + ': could not generate ' + length + ' unique values; widen the range')
        }
        const value = generateValue(prng, items, node, path + '[]')
        const key = serializeValue(items, value)
        if(seen.has(key)) continue
        seen.add(key)
        values.push(value)
    }
    return values
}

function compareScalars(a: unknown, b: unknown): number {
    if(typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
    if(typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0
    return Number(a) - Number(b)
}
