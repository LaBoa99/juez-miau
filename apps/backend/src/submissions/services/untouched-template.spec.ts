import { describe, expect, it } from 'vitest'
import type { IProblemSignature } from '@concurso/shared-types'
import { starterCode } from '../../judge/drivers/index.js'
import { programStarterCode } from '../../judge/drivers/program-starter.js'
import { isUntouchedTemplate } from './submissions.service.js'

const SIGNATURE: IProblemSignature = {
    functionName: 'sumar',
    params: [{ name: 'nums', type: { type: 'array', items: { type: 'int' } } }, { name: 'k', type: { type: 'long' } }],
    returns: { type: 'long' },
}

describe('isUntouchedTemplate', () => {
    it.each(['python', 'cpp', 'c', 'java'])('rechaza las dos plantillas de %s tal cual, aunque el IDE cambie los saltos de línea', (code) => {
        for(const template of [starterCode(code, SIGNATURE)!, programStarterCode(code, SIGNATURE)!]){
            expect(isUntouchedTemplate(template, code, SIGNATURE)).toBe(true)
            expect(isUntouchedTemplate(template.replace(/\n/g, '\r\n') + '\r\n\r\n', code, SIGNATURE)).toBe(true)
        }
    })

    // Así envió el código casi todo el concurso 2026B: con el comentario de la plantilla y la solución debajo
    it('acepta la plantilla con la solución escrita debajo del comentario', () => {
        const filled = programStarterCode('python', SIGNATURE)!.replace('Usa print.', 'Usa print.\nprint(sum(nums) * k)')
        expect(filled).toContain('Escribe tu solución aquí')
        expect(isUntouchedTemplate(filled, 'python', SIGNATURE)).toBe(false)
        const fn = starterCode('python', SIGNATURE)!.replace(/return .*/, 'return sum(nums) * k')
        expect(fn).toContain('Escribe tu código aquí')
        expect(isUntouchedTemplate(fn, 'python', SIGNATURE)).toBe(false)
    })

    it('acepta un archivo cualquiera', () => {
        expect(isUntouchedTemplate('print(1)\n', 'python', SIGNATURE)).toBe(false)
    })
})
