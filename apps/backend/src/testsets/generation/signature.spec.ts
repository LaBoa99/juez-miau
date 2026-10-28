import type { IProblemSignature } from '@concurso/shared-types'
import { normalizeInput, validateSignature } from './signature.js'

const valid: IProblemSignature = {
    functionName: 'sumar',
    params: [{ name: 'nums', type: { type: 'array', items: { type: 'int' } } }],
    returns: { type: 'long' },
}

describe('validateSignature', () => {
    it('acepta una firma válida', () => {
        expect(validateSignature(valid)).toEqual([])
    })

    it('rechaza nombres reservados, repetidos y tipos no soportados', () => {
        const errors = validateSignature({
            functionName: 'class',
            params: [
                { name: 'x', type: { type: 'int' } },
                { name: 'x', type: { type: 'char' } },
            ],
            returns: { type: 'array' },
        })

        expect(errors).toEqual(expect.arrayContaining([
            expect.stringContaining('functionName: "class" is a reserved word'),
            expect.stringContaining('duplicated parameter "x"'),
            expect.stringContaining('params[1].type: unsupported type "char"'),
            expect.stringContaining('returns.items: must be an object'),
        ]))
    })

    it('limita la profundidad de los arrays', () => {
        const deep = { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'int' } } } } }
        expect(validateSignature({ ...valid, returns: deep })).toEqual([expect.stringContaining('nested at most')])
    })
})

describe('normalizeInput', () => {
    const signature: IProblemSignature = {
        functionName: 'f',
        params: [
            { name: 'n', type: { type: 'int' } },
            { name: 'big', type: { type: 'long' } },
            { name: 'x', type: { type: 'float' } },
        ],
        returns: { type: 'bool' },
    }

    it('convierte los long a bigint', () => {
        const { value, errors } = normalizeInput(signature, { n: 3, big: '123456789012345678', x: 2 })
        expect(errors).toEqual([])
        expect(value).toEqual({ n: 3, big: 123456789012345678n, x: 2 })
    })

    it('reporta llaves de más, faltantes y tipos incorrectos', () => {
        const { errors } = normalizeInput(signature, { n: 2 ** 31, x: 'uno', extra: 1 })
        expect(errors).toEqual(expect.arrayContaining([
            'input.extra: not a parameter of f',
            'input.big: missing',
            'input.n: expected int (32 bits)',
            'input.x: expected a finite float',
        ]))
    })

    it('rechaza long como número fuera de ±2^53 (perdió precisión al parsear)', () => {
        const { errors } = normalizeInput(signature, { n: 1, big: 2 ** 60, x: 1 })
        expect(errors).toEqual([expect.stringContaining('input.big: expected long')])
    })

    it('no confunde llaves heredadas del prototipo con parámetros', () => {
        const proto: IProblemSignature = { functionName: 'f', params: [{ name: 'constructor', type: { type: 'int' } }], returns: { type: 'int' } }
        expect(normalizeInput(proto, {}).errors).toEqual(['input.constructor: missing'])
    })
})
