import type { IProblemSignature } from '@concurso/shared-types'
import { checkerInput, checkerNameCollisions, checkerSignature, generatorInput } from './special-programs.js'

const signature: IProblemSignature = {
    functionName: 'twoSum',
    params: [{ name: 'nums', type: { type: 'array', items: { type: 'int' } } }, { name: 'target', type: { type: 'int' } }],
    returns: { type: 'array', items: { type: 'int' } },
}

describe('checker y generador', () => {
    it('el checker recibe los parámetros del problema más la salida esperada y la del participante', () => {
        expect(checkerSignature(signature)).toEqual({
            functionName: 'check',
            params: [...signature.params, { name: 'expectedOutput', type: signature.returns }, { name: 'actualOutput', type: signature.returns }],
            returns: { type: 'bool' },
        })
        expect(checkerInput('{"nums":[1,2],"target":3}', '[0,1]', '[1,0]'))
            .toBe('{"nums":[1,2],"target":3,"expectedOutput":[0,1],"actualOutput":[1,0]}')
        expect(checkerInput('{}', '1', '2')).toBe('{"expectedOutput":1,"actualOutput":2}')
    })

    it('un parámetro no puede llamarse como los del checker', () => {
        expect(checkerNameCollisions(signature)).toEqual([])
        expect(checkerNameCollisions({ ...signature, params: [{ name: 'actualOutput', type: { type: 'int' } }] }))
            .toEqual(['parameter "actualOutput" is reserved for the checker; rename it'])
    })

    it('el generador recibe semilla, grupo e índice', () => {
        expect(generatorInput(42, 'grandes "x"', 2)).toBe('{"seed":42,"group":"grandes \\"x\\"","index":2}')
    })
})
