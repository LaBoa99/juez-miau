import { toCsv } from './csv.js'

describe('toCsv', () => {
    it('escapa comas, comillas y saltos de línea', () => {
        expect(toCsv(['a', 'b'], [['Los "Pumas", UNAM', null], [1, 'x\ny']]))
            .toBe('﻿a,b\r\n"Los ""Pumas"", UNAM",\r\n1,"x\ny"\r\n')
    })
})
