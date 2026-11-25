import type { IProblemSignature, TypeRef } from '@concurso/shared-types'
import { programStarterCode } from './program-starter.js'

const int: TypeRef = { type: 'int' }
const list: TypeRef = { type: 'array', items: int }

// Lo que hay entre la línea de NO TOCAR y la de "Escribe tu solución aquí"
const reading = (code: string) => code.slice(code.indexOf('NO TOCAR'), code.indexOf('Escribe tu solución aquí'))

describe('programStarterCode', () => {
    const own: IProblemSignature = { functionName: 'f', params: [{ name: 'a', type: list }, { name: 'k', type: int }], returns: int }
    const sized: IProblemSignature = {
        functionName: 'f',
        params: [{ name: 'n', type: int }, { name: 'a', type: list, size: 'n' }],
        returns: int,
    }

    it('Python lee la cantidad y toma exactamente esos elementos con un for', () => {
        expect(reading(programStarterCode('python', own)!)).toContain([
            'aCantidad = int(input())',
            'aPartes = input().split()',
            'a = []',
            'for i in range(aCantidad):',
            '    a.append(int(aPartes[i]))',
        ].join('\n'))
    })

    it('con tamaño marcado la lista usa n y no lee otra cantidad', () => {
        expect(reading(programStarterCode('python', sized)!)).toContain(
            'n = int(input())\naPartes = input().split()\na = []\nfor i in range(n):\n    a.append(int(aPartes[i]))')
        expect(reading(programStarterCode('java', sized)!)).toContain('int[] a = new int[n];')
        expect(reading(programStarterCode('cpp', sized)!)).not.toContain('aCantidad')
        expect(reading(programStarterCode('c', sized)!)).toContain('malloc(n * sizeof(int))')
    })

    it.each(['python', 'javascript', 'typescript'])('%s no usa map, lambda, comprensiones ni filter', (language) => {
        const code = reading(programStarterCode(language, own)!)
        expect(code).not.toMatch(/\bmap\(|lambda|=>|\bfilter\(| for \w+ in \w+\.|\[\s*\w+ for /)
        expect(code).toMatch(/for /)
    })

    it('C y C++ saltan lo que sobra de la línea de elementos', () => {
        expect(reading(programStarterCode('cpp', own)!).match(/cin\.ignore/g)).toHaveLength(2)
        expect(reading(programStarterCode('c', own)!).match(/scanf\("%\*\[\^\\n\]"\)/g)).toHaveLength(2)
    })
})
