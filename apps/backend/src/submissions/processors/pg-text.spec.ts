import { pgText } from './submission.processor.js'

describe('pgText', () => {
    it('cambia el byte 0 (Postgres no lo acepta en text) y conserva null', () => {
        expect(pgText('a\0b\0')).toBe('a�b�')
        expect(pgText(undefined)).toBeNull()
    })
})
