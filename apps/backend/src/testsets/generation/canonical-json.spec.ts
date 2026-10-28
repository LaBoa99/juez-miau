import type { IProblemSignature } from '@concurso/shared-types'
import { parseJsonPreservingIntegers, serializeInput, serializeValue } from './canonical-json.js'
import { normalizeInput } from './signature.js'

const signature: IProblemSignature = {
    functionName: 'solve',
    params: [
        { name: 'b', type: { type: 'float' } },
        { name: 'a', type: { type: 'array', items: { type: 'long' } } },
        { name: 'flag', type: { type: 'bool' } },
        { name: 'name', type: { type: 'string' } },
    ],
    returns: { type: 'int' },
}

describe('JSON canónico', () => {
    it('escribe las llaves en el orden de la firma y los float con decimal', () => {
        const { value, errors } = normalizeInput(signature, { name: 'hola "mundo"', flag: true, a: [1, '-9223372036854775808'], b: 5 })

        expect(errors).toEqual([])
        expect(serializeInput(signature, value)).toBe('{"b":5.0,"a":[1,-9223372036854775808],"flag":true,"name":"hola \\"mundo\\""}')
    })

    it('no pierde precisión en long mayores a 2^53', () => {
        expect(serializeValue({ type: 'long' }, 9007199254740993n)).toBe('9007199254740993')
    })

    it('normaliza -0 y respeta exponentes', () => {
        expect(serializeValue({ type: 'float' }, -0)).toBe('0.0')
        expect(serializeValue({ type: 'float' }, 1e21)).toBe('1e+21')
        expect(serializeValue({ type: 'float' }, 0.5)).toBe('0.5')
    })

    it('al leer conserva como string los enteros que no caben en un double', () => {
        expect(parseJsonPreservingIntegers('{"a":[9007199254740993,3,1.5]}')).toEqual({ a: ['9007199254740993', 3, 1.5] })
    })

    it('ida y vuelta: leer el canónico y volver a serializarlo da los mismos bytes', () => {
        const text = '{"b":0.1,"a":[9223372036854775807],"flag":false,"name":"ñ"}'
        const { value, errors } = normalizeInput(signature, parseJsonPreservingIntegers(text))

        expect(errors).toEqual([])
        expect(serializeInput(signature, value)).toBe(text)
    })
})
