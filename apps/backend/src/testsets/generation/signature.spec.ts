import type { IProblemSignature } from '@concurso/shared-types'
import { findLineBreaks, normalizeInput, validateSignature } from './signature.js'

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

describe('findLineBreaks', () => {
    it('señala los strings con salto de línea, también dentro de arrays', () => {
        const signature: IProblemSignature = {
            functionName: 'f',
            params: [{ name: 'nombre', type: { type: 'string' } }, { name: 'palabras', type: { type: 'array', items: { type: 'string' } } }, { name: 'n', type: { type: 'int' } }],
            returns: { type: 'int' },
        }
        expect(findLineBreaks(signature, { nombre: '  ana ', palabras: ['', 'a b'], n: 3 })).toEqual([])
        expect(findLineBreaks(signature, { nombre: 'a\nb', palabras: ['ok', 'x\r'], n: 3 })).toEqual([
            'input.nombre: in a full program a string cannot contain line breaks',
            'input.palabras[1]: in a full program a string cannot contain line breaks',
        ])
    })
})

describe('tamaño de una lista (size)', () => {
    const intT = { type: 'int' } as const
    const list = { type: 'array', items: intT } as const
    const sized: IProblemSignature = {
        functionName: 'dias',
        params: [{ name: 'n', type: intT }, { name: 'a', type: list, size: 'n' }],
        returns: intT,
    }

    it('acepta un int declarado antes como tamaño de una lista', () => {
        expect(validateSignature(sized)).toEqual([])
    })

    it('rechaza un tamaño que no es un int anterior, en algo que no es lista o repetido', () => {
        const errors = (params: unknown[]) => validateSignature({ functionName: 'f', params, returns: intT })
        expect(errors([{ name: 'a', type: list, size: 'n' }, { name: 'n', type: intT }])).toEqual([expect.stringMatching(/params\[0\]\.size: must name an int parameter declared before a/)])
        expect(errors([{ name: 'n', type: { type: 'long' } }, { name: 'a', type: list, size: 'n' }])).toEqual([expect.stringMatching(/"n" must be an int/)])
        expect(errors([{ name: 'n', type: intT }, { name: 'x', type: intT, size: 'n' }])).toEqual([expect.stringMatching(/only arrays have a size/)])
        expect(errors([{ name: 'n', type: intT }, { name: 'a', type: list, size: 'n' }, { name: 'b', type: list, size: 'n' }]))
            .toEqual([expect.stringMatching(/"n" is already the size of another array/)])
    })

    it('normalizeInput calcula el tamaño si falta y rechaza uno distinto', () => {
        expect(normalizeInput(sized, { a: [3, 5, 2] })).toEqual({ value: { a: [3, 5, 2], n: 3 }, errors: [] })
        expect(normalizeInput(sized, { n: 3, a: [3, 5, 2] }).errors).toEqual([])
        expect(normalizeInput(sized, { n: 4, a: [3, 5, 2] }).errors).toEqual(['input.n: must equal the length of a (3)'])
    })
})
