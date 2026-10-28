import type { IProblemSignature, ISchemaGroup, ITestsetSchema, SchemaNode, TypeRef } from '@concurso/shared-types'
import { MAX_ELEMENTS_PER_CASE, MAX_TESTSET_CASES } from './limits.js'
import { LONG_MAX, LONG_MIN, typeToString } from './signature.js'

const INT_MIN = BigInt(-(2 ** 31))
const INT_MAX = BigInt(2 ** 31 - 1)
const MAX_LENGTH = 10_000_000

// Llaves válidas por tipo de nodo; cualquier otra suele ser un error de dedo
const NODE_KEYS: Record<string, string[]> = {
    int: ['type', 'min', 'max'],
    long: ['type', 'min', 'max'],
    float: ['type', 'min', 'max', 'decimals'],
    bool: ['type'],
    string: ['type', 'length', 'charset'],
    array: ['type', 'length', 'items', 'unique', 'sorted'],
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Combina recursivamente; los arrays (p. ej. `length`) y los escalares se reemplazan
export function mergeNode(base: unknown, override: unknown): unknown {
    if(!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override

    const merged: Record<string, unknown> = { ...base }
    for(const [key, value] of Object.entries(override)){
        merged[key] = mergeNode(base[key], value)
    }
    return merged
}

// Nodo final de cada parámetro para un grupo. Asume un esquema ya validado
export function resolveGroupNodes(schema: ITestsetSchema, group: ISchemaGroup): Record<string, SchemaNode> {
    const nodes: Record<string, SchemaNode> = {}
    for(const [name, node] of Object.entries(schema.params)){
        nodes[name] = mergeNode(node, group.overrides?.[name]) as SchemaNode
    }
    return nodes
}

// Rango de un int o long ya validado
export function integerBounds(node: { min?: number | string, max?: number | string }): [bigint, bigint] {
    return [BigInt(node.min!), BigInt(node.max!), ]
}

// Caracteres de un charset tipo "a-zA-Z0-9_". Un "-" al inicio o al final es literal.
// Regresa null si algún rango está invertido
export function expandCharset(spec: string): string[] | null {
    const chars = [...spec]
    const result = new Set<string>()

    for(let i = 0; i < chars.length; i++){
        if(i + 2 < chars.length && chars[i + 1] === '-'){
            const from = chars[i].codePointAt(0)!
            const to = chars[i + 2].codePointAt(0)!
            if(from > to) return null
            for(let code = from; code <= to; code++) result.add(String.fromCodePoint(code))
            i += 2
        } else {
            result.add(chars[i])
        }
    }

    return [...result]
}

function parseInteger(value: unknown): bigint | null {
    if(typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value)
    if(typeof value === 'string' && /^-?\d{1,19}$/.test(value)) return BigInt(value)
    return null
}

function validateLength(value: unknown, path: string, errors: string[]): number {
    if(!Array.isArray(value) || value.length !== 2 || !value.every((n) => Number.isInteger(n))
        || value[0] < 0 || value[0] > value[1] || value[1] > MAX_LENGTH){
        errors.push(path + '.length: must be [min, max] with 0 <= min <= max <= ' + MAX_LENGTH)
        return 0
    }
    return value[1]
}

// Valida un nodo ya combinado y regresa cuántos elementos escalares puede producir como máximo
function validateNode(type: TypeRef, node: unknown, path: string, errors: string[]): number {
    if(!isPlainObject(node)){
        errors.push(path + ': must be an object')
        return 0
    }
    if(node.type !== type.type){
        errors.push(path + '.type: must be "' + type.type + '" to match the signature (' + typeToString(type) + ')')
        return 0
    }

    const unknownKeys = Object.keys(node).filter((key) => !NODE_KEYS[type.type].includes(key))
    if(unknownKeys.length > 0){
        errors.push(path + ': unknown keys for ' + type.type + ': ' + unknownKeys.join(', '))
    }

    switch(type.type){
        case 'int':
        case 'long': {
            const [lower, upper] = type.type === 'int' ? [INT_MIN, INT_MAX] : [LONG_MIN, LONG_MAX]
            const min = parseInteger(node.min)
            const max = parseInteger(node.max)
            if(min === null || min < lower || min > upper) errors.push(path + '.min: must be a ' + type.type + ' (strings allowed beyond ±2^53)')
            if(max === null || max < lower || max > upper) errors.push(path + '.max: must be a ' + type.type + ' (strings allowed beyond ±2^53)')
            if(min !== null && max !== null && min > max) errors.push(path + ': min must be <= max')
            return 1
        }
        case 'float': {
            const { min, max, decimals } = node
            if(typeof min !== 'number' || !Number.isFinite(min)) errors.push(path + '.min: must be a finite number')
            if(typeof max !== 'number' || !Number.isFinite(max)) errors.push(path + '.max: must be a finite number')
            if(typeof min === 'number' && typeof max === 'number' && min > max) errors.push(path + ': min must be <= max')
            if(decimals !== undefined && (!Number.isInteger(decimals) || (decimals as number) < 0 || (decimals as number) > 12)){
                errors.push(path + '.decimals: must be an integer between 0 and 12')
            }
            return 1
        }
        case 'bool':
            return 1
        case 'string': {
            const maxLength = validateLength(node.length, path, errors)
            if(typeof node.charset !== 'string' || node.charset.length === 0){
                errors.push(path + '.charset: must be a non-empty string like "a-z0-9"')
            } else if(expandCharset(node.charset) === null){
                errors.push(path + '.charset: has a reversed range')
            }
            return maxLength
        }
        case 'array': {
            const maxLength = validateLength(node.length, path, errors)
            const perItem = validateNode(type.items, node.items, path + '.items', errors)

            if(node.unique !== undefined && typeof node.unique !== 'boolean'){
                errors.push(path + '.unique: must be a boolean')
            }
            if(node.sorted !== undefined){
                if(node.sorted !== 'asc' && node.sorted !== 'desc'){
                    errors.push(path + '.sorted: must be "asc" or "desc"')
                } else if(type.items.type === 'array'){
                    errors.push(path + '.sorted: only arrays of scalars can be sorted')
                }
            }
            if(node.unique === true && isPlainObject(node.items)){
                validateUniqueIsFeasible(type.items, node.items, maxLength, path, errors)
            }

            return maxLength * Math.max(perItem, 1)
        }
    }
}

// Solo se puede saber de antemano en enteros y bool; en el resto lo detecta el generador
function validateUniqueIsFeasible(items: TypeRef, node: Record<string, unknown>, maxLength: number, path: string, errors: string[]): void {
    let available: bigint | null = null
    if(items.type === 'bool') available = 2n
    if(items.type === 'int' || items.type === 'long'){
        const min = parseInteger(node.min)
        const max = parseInteger(node.max)
        if(min !== null && max !== null && min <= max) available = max - min + 1n
    }

    if(available !== null && available < BigInt(maxLength)){
        errors.push(path + ': cannot generate ' + maxLength + ' unique values, the range only has ' + available)
    }
}

export function validateSchema(signature: IProblemSignature, schema: unknown): string[] {
    const errors: string[] = []
    if(!isPlainObject(schema)) return ['schema must be an object with params and groups']

    const { params, groups } = schema
    if(!isPlainObject(params)) return ['schema.params must be an object with one node per parameter']
    if(!Array.isArray(groups) || groups.length === 0) return ['schema.groups must be a non-empty array']

    const names = signature.params.map((param) => param.name)
    for(const key of Object.keys(params)){
        if(!names.includes(key)) errors.push('schema.params.' + key + ': not a parameter of ' + signature.functionName)
    }
    for(const name of names){
        if(!Object.hasOwn(params, name)) errors.push('schema.params.' + name + ': missing')
    }
    if(errors.length > 0) return errors

    const groupNames = new Set<string>()
    let totalCases = 0

    groups.forEach((group: unknown, index) => {
        const path = 'schema.groups[' + index + ']'
        if(!isPlainObject(group)){
            errors.push(path + ': must be an object')
            return
        }

        if(typeof group.name !== 'string' || !group.name.trim() || group.name.length > 64){
            errors.push(path + '.name: must be a non-empty string of up to 64 characters')
        } else if(groupNames.has(group.name)){
            errors.push(path + '.name: duplicated group "' + group.name + '"')
        } else {
            groupNames.add(group.name)
        }

        const seeds = group.seeds
        if(!Array.isArray(seeds) || seeds.length === 0 || !seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0)){
            errors.push(path + '.seeds: must be a non-empty array of non-negative integers')
        } else {
            if(new Set(seeds).size !== seeds.length) errors.push(path + '.seeds: has duplicated seeds')
            totalCases += seeds.length
        }

        if(group.overrides !== undefined){
            if(!isPlainObject(group.overrides)){
                errors.push(path + '.overrides: must be an object')
                return
            }
            for(const key of Object.keys(group.overrides)){
                if(!names.includes(key)) errors.push(path + '.overrides.' + key + ': not a parameter')
            }
        }

        let elements = 0
        for(const param of signature.params){
            const node = mergeNode(params[param.name], (group.overrides as Record<string, unknown> | undefined)?.[param.name])
            elements += validateNode(param.type, node, path + ' ' + param.name, errors)
        }
        if(elements > MAX_ELEMENTS_PER_CASE){
            errors.push(path + ': a case could have up to ' + elements + ' values; the limit is ' + MAX_ELEMENTS_PER_CASE)
        }
    })

    if(totalCases > MAX_TESTSET_CASES){
        errors.push('schema: ' + totalCases + ' seeds in total; the limit is ' + MAX_TESTSET_CASES + ' cases per testset')
    }

    return errors
}
