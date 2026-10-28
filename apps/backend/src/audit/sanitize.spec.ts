import { sanitizeBody } from './sanitize.js'

describe('sanitizeBody', () => {
    it('oculta contraseñas, tokens y código, también anidados', () => {
        expect(sanitizeBody({ name: 'Ana', password: 'x', nested: { refreshToken: 'y', ok: 1 }, source: 'print(1)' }))
            .toEqual({ name: 'Ana', password: '[redacted]', nested: { refreshToken: '[redacted]', ok: 1 }, source: '[redacted]' })
    })

    it('recorta textos largos y cuerpos enormes', () => {
        expect((sanitizeBody({ statement: 'a'.repeat(1000) })!.statement as string).length).toBe(301)
        expect(sanitizeBody(Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['k' + i, 'v'.repeat(200)]))))
            .toMatchObject({ truncated: true })
        expect(sanitizeBody({})).toBeNull()
        expect(sanitizeBody(undefined)).toBeNull()
    })
})
