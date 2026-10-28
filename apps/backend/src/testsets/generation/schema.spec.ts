import type { IProblemSignature } from '@concurso/shared-types'
import { expandCharset, mergeNode, validateSchema } from './schema.js'

const signature: IProblemSignature = {
    functionName: 'f',
    params: [
        { name: 'nums', type: { type: 'array', items: { type: 'int' } } },
        { name: 'word', type: { type: 'string' } },
    ],
    returns: { type: 'int' },
}

const schema = {
    params: {
        nums: { type: 'array', items: { type: 'int' } },
        word: { type: 'string', length: [1, 5], charset: 'a-z' },
    },
    groups: [
        { name: 'chicos', seeds: [1, 2], overrides: { nums: { length: [1, 5], items: { min: -10, max: 10 } } } },
        { name: 'grandes', seeds: [3], overrides: { nums: { length: [1000, 1000], items: { min: 0, max: 1000000 }, unique: true } } },
    ],
}

describe('validateSchema', () => {
    it('acepta el esquema del ejemplo de judge-evaluation.md', () => {
        expect(validateSchema(signature, schema)).toEqual([])
    })

    it('exige que cada grupo complete los nodos', () => {
        const errors = validateSchema(signature, { ...schema, groups: [{ name: 'sin rango', seeds: [1] }] })
        expect(errors).toEqual(expect.arrayContaining([
            expect.stringContaining('nums.length: must be [min, max]'),
            expect.stringContaining('nums.items.min: must be a int'),
        ]))
    })

    it('detecta tipos que no coinciden con la firma y llaves desconocidas', () => {
        const errors = validateSchema(signature, {
            params: { nums: { type: 'array', items: { type: 'float', min: 0, max: 1 }, length: [1, 1] }, word: { type: 'string', length: [1, 1], charset: 'a', size: 3 } },
            groups: [{ name: 'g', seeds: [1] }],
        })
        expect(errors).toEqual(expect.arrayContaining([
            expect.stringContaining('nums.items.type: must be "int"'),
            expect.stringContaining('unknown keys for string: size'),
        ]))
    })

    it('rechaza unique imposible, semillas repetidas, parámetros faltantes y rangos invertidos', () => {
        const errors = validateSchema(signature, {
            params: { nums: { type: 'array', length: [5, 5], unique: true, items: { type: 'int', min: 1, max: 3 } }, word: { type: 'string', length: [1, 1], charset: 'z-a' } },
            groups: [{ name: 'g', seeds: [1, 1] }],
        })
        expect(errors).toEqual(expect.arrayContaining([
            expect.stringContaining('cannot generate 5 unique values, the range only has 3'),
            expect.stringContaining('seeds: has duplicated seeds'),
            expect.stringContaining('charset: has a reversed range'),
        ]))
        expect(validateSchema(signature, { params: { nums: schema.params.nums }, groups: schema.groups })).toEqual(['schema.params.word: missing'])
    })

    it('limita el tamaño de un caso', () => {
        const errors = validateSchema(signature, {
            ...schema,
            groups: [{ name: 'enorme', seeds: [1], overrides: { nums: { length: [10000000, 10000000], items: { min: 0, max: 1 } } } }],
        })
        expect(errors).toEqual([expect.stringContaining('the limit is 2000000')])
    })
})

describe('auxiliares del esquema', () => {
    it('combina overrides recursivamente y reemplaza arrays', () => {
        expect(mergeNode({ type: 'array', length: [1, 2], items: { type: 'int', min: 0 } }, { length: [5, 5], items: { max: 9 } }))
            .toEqual({ type: 'array', length: [5, 5], items: { type: 'int', min: 0, max: 9 } })
    })

    it('expande rangos del charset', () => {
        expect(expandCharset('a-c0-1_')).toEqual(['a', 'b', 'c', '0', '1', '_'])
        expect(expandCharset('-a')).toEqual(['-', 'a'])
        expect(expandCharset('c-a')).toBeNull()
    })
})
