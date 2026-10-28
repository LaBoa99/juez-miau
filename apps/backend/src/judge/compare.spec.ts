import { CompareMode, type TypeRef } from '@concurso/shared-types'
import { normalizeOutput, outputsMatch } from './compare.js'

const floats: TypeRef = { type: 'array', items: { type: 'float' } }
const longs: TypeRef = { type: 'array', items: { type: 'long' } }

describe('normalizeOutput', () => {
    it('reescribe en forma canónica lo que escriben los drivers', () => {
        expect(normalizeOutput(floats, '[5,1.00000000015E10,-0]')).toEqual({ ok: true, canonical: '[5.0,10000000001.5,0.0]' })
        // JS escribe los bigint como string; los long grandes no pasan por double
        expect(normalizeOutput(longs, '["9007199254740993",27021597764222979]'))
            .toEqual({ ok: true, canonical: '[9007199254740993,27021597764222979]' })
    })

    it('rechaza JSON inválido y tipos distintos a la firma', () => {
        expect(normalizeOutput(floats, '[NaN]')).toMatchObject({ ok: false })
        expect(normalizeOutput(floats, 'null')).toEqual({ ok: false, message: 'result: expected float[]' })
        expect(normalizeOutput({ type: 'int' }, 'true')).toEqual({ ok: false, message: 'result: expected int (32 bits)' })
    })
})

describe('outputsMatch', () => {
    it('en modo exacto compara el texto canónico', () => {
        expect(outputsMatch(floats, '[0.1]', '[0.1]', CompareMode.EXACT, null)).toBe(true)
        expect(outputsMatch(floats, '[0.1]', '[0.10000001]', CompareMode.EXACT, null)).toBe(false)
    })

    it('con tolerancia acepta error absoluto o relativo', () => {
        expect(outputsMatch(floats, '[0.1000001]', '[0.1]', CompareMode.TOLERANCE, null)).toBe(true)
        expect(outputsMatch(floats, '[1000001000.0]', '[1000000000.0]', CompareMode.TOLERANCE, 1e-6)).toBe(true)
        expect(outputsMatch(floats, '[0.11]', '[0.1]', CompareMode.TOLERANCE, 1e-6)).toBe(false)
        expect(outputsMatch(floats, '[0.1,0.2]', '[0.1]', CompareMode.TOLERANCE, 1e-6)).toBe(false)
    })
})
