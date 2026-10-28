import type { IProblemSignature, ITestsetSchema } from '@concurso/shared-types'
import { parseJsonPreservingIntegers } from './canonical-json.js'
import { generateCases } from './generate.js'
import { Prng } from './prng.js'
import { validateSchema } from './schema.js'

const signature: IProblemSignature = {
    functionName: 'f',
    params: [
        { name: 'nums', type: { type: 'array', items: { type: 'int' } } },
        { name: 'big', type: { type: 'long' } },
        { name: 'x', type: { type: 'float' } },
        { name: 'word', type: { type: 'string' } },
        { name: 'flags', type: { type: 'array', items: { type: 'bool' } } },
    ],
    returns: { type: 'int' },
}

const schema: ITestsetSchema = {
    params: {
        nums: { type: 'array', items: { type: 'int', min: -50, max: 50 }, length: [0, 20] },
        big: { type: 'long', min: '-9223372036854775808', max: '9223372036854775807' },
        x: { type: 'float', min: -1, max: 1, decimals: 3 },
        word: { type: 'string', length: [3, 8], charset: 'a-f' },
        flags: { type: 'array', items: { type: 'bool' }, length: [0, 2], unique: true },
    },
    groups: [
        { name: 'chicos', seeds: [1, 2, 3] },
        { name: 'ordenados', seeds: [1], overrides: { nums: { length: [30, 30], unique: true, sorted: 'desc', items: { min: 0, max: 40 } } } },
    ],
}

type Input = { nums: number[], big: string | number, x: number, word: string, flags: boolean[] }
const parse = (text: string) => parseJsonPreservingIntegers(text) as Input

describe('generateCases', () => {
    it('el esquema de prueba es válido', () => {
        expect(validateSchema(signature, schema)).toEqual([])
    })

    it('es determinista y produce un caso por semilla', () => {
        const first = [...generateCases(signature, schema)]
        const second = [...generateCases(signature, schema)]

        expect(first).toHaveLength(4)
        expect(first).toEqual(second)
        expect(first.map((c) => c.group + '/' + c.seed)).toEqual(['chicos/1', 'chicos/2', 'chicos/3', 'ordenados/1'])
    })

    it('la misma semilla en otro grupo da otros datos', () => {
        const cases = [...generateCases(signature, schema)]
        expect(cases[0].text).not.toBe(cases[3].text)
    })

    it('respeta rangos, longitudes, decimales y charset', () => {
        for(const generated of generateCases(signature, schema)){
            const input = parse(generated.text)
            expect(input.nums.every((n) => Number.isInteger(n) && n >= -50 && n <= 50)).toBe(true)
            expect(BigInt(input.big) >= -(2n ** 63n) && BigInt(input.big) < 2n ** 63n).toBe(true)
            expect(input.x).toBeGreaterThanOrEqual(-1)
            expect(input.x).toBeLessThanOrEqual(1)
            expect(Math.round(input.x * 1000) / 1000).toBe(input.x)
            expect(input.word).toMatch(/^[a-f]{3,8}$/)
            expect(new Set(input.flags).size).toBe(input.flags.length)
        }
    })

    it('aplica overrides de grupo con unique y sorted', () => {
        const last = [...generateCases(signature, schema)][3]
        const { nums } = parse(last.text)

        expect(nums).toHaveLength(30)
        expect(new Set(nums).size).toBe(30)
        expect(nums).toEqual([...nums].sort((a, b) => b - a))
        expect(nums.every((n) => n >= 0 && n <= 40)).toBe(true)
    })

    it('unique con rango completo usa todos los valores', () => {
        const all: ITestsetSchema = {
            params: { ...schema.params, nums: { type: 'array', items: { type: 'int', min: 1, max: 10 }, length: [10, 10], unique: true, sorted: 'asc' } },
            groups: [{ name: 'g', seeds: [7] }],
        }
        const [generated] = [...generateCases(signature, all)]
        expect(parse(generated.text).nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
})

describe('Prng', () => {
    it('below() no se sale del rango y cubre todos los valores', () => {
        const prng = Prng.fromKey('test')
        const seen = new Set<number>()
        for(let i = 0; i < 1000; i++){
            const value = prng.below(7)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(7)
            seen.add(value)
        }
        expect(seen.size).toBe(7)
    })

    it('bigint() maneja el rango completo de 64 bits', () => {
        const prng = Prng.fromKey('long')
        for(let i = 0; i < 100; i++){
            const value = prng.bigint(-(2n ** 63n), 2n ** 63n - 1n)
            expect(value >= -(2n ** 63n) && value <= 2n ** 63n - 1n).toBe(true)
        }
    })

    it('float() está en [0, 1)', () => {
        const prng = Prng.fromKey('float')
        for(let i = 0; i < 1000; i++){
            const value = prng.float()
            expect(value >= 0 && value < 1).toBe(true)
        }
    })
})
