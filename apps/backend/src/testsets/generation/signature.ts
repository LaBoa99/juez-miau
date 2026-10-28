import type { IProblemSignature, ScalarType, TypeRef } from '@concurso/shared-types'
import { MAX_TYPE_DEPTH, MAX_VALIDATION_ERRORS } from './limits.js'

export const SCALAR_TYPES: readonly ScalarType[] = ['int', 'long', 'float', 'bool', 'string']

const INT_MIN = -(2 ** 31)
const INT_MAX = 2 ** 31 - 1
export const LONG_MIN = -(2n ** 63n)
export const LONG_MAX = 2n ** 63n - 1n

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

// Palabras reservadas de C, C++, Java, Python, TypeScript y C#: un parámetro con estos
// nombres rompería el driver de algún lenguaje
const RESERVED = new Set([
    'abstract', 'and', 'as', 'assert', 'async', 'await', 'base', 'bool', 'boolean', 'break', 'byte', 'case',
    'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'def', 'default', 'del', 'delegate',
    'delete', 'do', 'double', 'elif', 'else', 'enum', 'event', 'except', 'explicit', 'export', 'extends',
    'extern', 'false', 'final', 'finally', 'fixed', 'float', 'for', 'foreach', 'from', 'function', 'global',
    'goto', 'if', 'implements', 'implicit', 'import', 'in', 'inline', 'instanceof', 'int', 'interface',
    'internal', 'is', 'lambda', 'let', 'lock', 'long', 'main', 'Main', 'namespace', 'native', 'new',
    'nonlocal', 'not', 'null', 'object', 'operator', 'or', 'out', 'override', 'package', 'params', 'pass',
    'private', 'protected', 'public', 'raise', 'readonly', 'ref', 'register', 'return', 'sbyte', 'sealed',
    'short', 'signed', 'sizeof', 'static', 'string', 'struct', 'super', 'switch', 'synchronized', 'template',
    'this', 'throw', 'throws', 'transient', 'true', 'try', 'typedef', 'typename', 'typeof', 'uint', 'ulong',
    'union', 'unsafe', 'unsigned', 'ushort', 'using', 'var', 'virtual', 'void', 'volatile', 'while', 'with',
    'yield', 'None', 'True', 'False', 'std', 'NULL', 'undefined',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateIdentifier(name: unknown, path: string, errors: string[]): void {
    if(typeof name !== 'string' || !IDENTIFIER.test(name)){
        errors.push(path + ': must be an identifier (letters, digits and _, up to 64 characters)')
    } else if(RESERVED.has(name)){
        errors.push(path + ': "' + name + '" is a reserved word in one of the supported languages')
    }
}

export function validateTypeRef(type: unknown, path: string, errors: string[], depth = 0): void {
    if(!isPlainObject(type)){
        errors.push(path + ': must be an object like { "type": "int" }')
        return
    }

    if(type.type === 'array'){
        if(depth >= MAX_TYPE_DEPTH){
            errors.push(path + ': arrays can be nested at most ' + MAX_TYPE_DEPTH + ' levels')
            return
        }
        if(Object.keys(type).some((key) => key !== 'type' && key !== 'items')){
            errors.push(path + ': array types only accept "type" and "items"')
        }
        validateTypeRef(type.items, path + '.items', errors, depth + 1)
        return
    }

    if(!SCALAR_TYPES.includes(type.type as ScalarType)){
        errors.push(path + ': unsupported type ' + JSON.stringify(type.type) + ' (use ' + [...SCALAR_TYPES, 'array'].join(', ') + ')')
    } else if(Object.keys(type).length !== 1){
        errors.push(path + ': scalar types only accept "type"')
    }
}

export function validateSignature(signature: unknown): string[] {
    const errors: string[] = []
    if(!isPlainObject(signature)){
        return ['signature must be an object']
    }

    validateIdentifier(signature.functionName, 'functionName', errors)

    if(!Array.isArray(signature.params)){
        errors.push('params must be an array')
    } else {
        if(signature.params.length > 16){
            errors.push('params: at most 16 parameters')
        }
        const seen = new Set<string>()
        signature.params.forEach((param: unknown, index) => {
            const path = 'params[' + index + ']'
            if(!isPlainObject(param)){
                errors.push(path + ': must be an object with name and type')
                return
            }
            validateIdentifier(param.name, path + '.name', errors)
            if(typeof param.name === 'string'){
                if(seen.has(param.name)) errors.push(path + '.name: duplicated parameter "' + param.name + '"')
                if(param.name === signature.functionName) errors.push(path + '.name: cannot be the same as the function name')
                seen.add(param.name)
            }
            validateTypeRef(param.type, path + '.type', errors)
        })
    }

    validateTypeRef(signature.returns, 'returns', errors)

    return errors
}

export function typeToString(type: TypeRef): string {
    return type.type === 'array' ? typeToString(type.items) + '[]' : type.type
}

export function sameType(a: TypeRef, b: TypeRef): boolean {
    if(a.type === 'array' || b.type === 'array'){
        return a.type === 'array' && b.type === 'array' && sameType(a.items, b.items)
    }
    return a.type === b.type
}

// Revisa que `value` sea del tipo y lo regresa normalizado (los long como bigint).
// Si hay errores los agrega a `errors` y el valor regresado no sirve
export function normalizeValue(type: TypeRef, value: unknown, path: string, errors: string[]): unknown {
    if(errors.length >= MAX_VALIDATION_ERRORS) return undefined

    switch(type.type){
        case 'int':
            if(typeof value !== 'number' || !Number.isInteger(value) || value < INT_MIN || value > INT_MAX){
                errors.push(path + ': expected int (32 bits)')
            }
            return value
        case 'long': {
            let parsed: bigint | null = null
            if(typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value)
            if(typeof value === 'string' && /^-?\d{1,19}$/.test(value)) parsed = BigInt(value)

            if(parsed === null || parsed < LONG_MIN || parsed > LONG_MAX){
                errors.push(path + ': expected long (64 bits; send values beyond ±2^53 as strings)')
            }
            return parsed
        }
        case 'float':
            if(typeof value !== 'number' || !Number.isFinite(value)){
                errors.push(path + ': expected a finite float')
            }
            return value
        case 'bool':
            if(typeof value !== 'boolean'){
                errors.push(path + ': expected bool')
            }
            return value
        case 'string':
            if(typeof value !== 'string'){
                errors.push(path + ': expected string')
            }
            return value
        case 'array':
            if(!Array.isArray(value)){
                errors.push(path + ': expected ' + typeToString(type))
                return value
            }
            return value.map((item, index) => normalizeValue(type.items, item, path + '[' + index + ']', errors))
    }
}

export function normalizeInput(signature: IProblemSignature, input: unknown): { value: Record<string, unknown>, errors: string[] } {
    const errors: string[] = []
    const value: Record<string, unknown> = {}

    if(!isPlainObject(input)){
        return { value, errors: ['input must be an object with one key per parameter'] }
    }

    const names = new Set(signature.params.map((param) => param.name))
    for(const key of Object.keys(input)){
        if(!names.has(key)) errors.push('input.' + key + ': not a parameter of ' + signature.functionName)
    }
    for(const param of signature.params){
        if(!Object.hasOwn(input, param.name)){
            errors.push('input.' + param.name + ': missing')
            continue
        }
        value[param.name] = normalizeValue(param.type, input[param.name], 'input.' + param.name, errors)
    }

    return { value, errors }
}
