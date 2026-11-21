import { describe, expect, it } from 'vitest'
import { CsvService } from '../../utils/services/csv.service.js'
import { EditionTeamsService, participantsToTeams } from './edition-teams.service.js'

// Formato de inscripciones: una fila por participante
const HEADER = '﻿No.,Nombre Equipo,Codigo,Nombre,Carrera,Nivel,Tipo'
const csv = (...lines: string[]) => Buffer.from([HEADER, ...lines].join('\n'))
const parse = (...lines: string[]) => new CsvService().parse(csv(...lines))

describe('participantsToTeams', () => {
    it('agrupa por equipo y cada individual es su propio equipo con su nombre', () => {
        const { rows, rowNumbers, errors } = participantsToTeams(parse(
            '1,Los Bits,1,ANA,ISC,INTERMEDIO,modalidad_equipo',
            '2,Individual,2,JAVIER MORA,IME,BÁSICO,modalidad_individual',
            '3,Los Bits,3,LUIS,ISC,INTERMEDIO,modalidad_equipo',
            '4,Individual,4,ADRIANA LOPEZ,QFB,BÁSICO,modalidad_individual',
        ))
        expect(errors).toEqual([])
        expect(rowNumbers).toEqual([2, 3, 5])
        expect(rows).toEqual([
            { NombreEquipo: 'Los Bits', Categoria: 'INTERMEDIO', Integrante1Nombre: 'ANA', Integrante1Carrera: 'ISC', Integrante2Nombre: 'LUIS', Integrante2Carrera: 'ISC' },
            { NombreEquipo: 'JAVIER MORA', Categoria: 'BÁSICO', Integrante1Nombre: 'JAVIER MORA', Integrante1Carrera: 'IME' },
            { NombreEquipo: 'ADRIANA LOPEZ', Categoria: 'BÁSICO', Integrante1Nombre: 'ADRIANA LOPEZ', Integrante1Carrera: 'QFB' },
        ])
    })

    it('descarta equipos con más de 3 integrantes o niveles distintos', () => {
        const { rows, errors } = participantsToTeams(parse(
            '1,A,1,UNO,ISC,BÁSICO,modalidad_equipo',
            '2,A,2,DOS,ISC,BÁSICO,modalidad_equipo',
            '3,A,3,TRES,ISC,BÁSICO,modalidad_equipo',
            '4,A,4,CUATRO,ISC,BÁSICO,modalidad_equipo',
            '5,B,5,CINCO,ISC,BÁSICO,modalidad_equipo',
            '6,B,6,SEIS,ISC,INTERMEDIO,modalidad_equipo',
        ))
        expect(rows).toEqual([])
        expect(errors.map((e) => [e.row, e.column])).toEqual([[5, 'Nombre Equipo'], [7, 'Nivel']])
    })
})

describe('EditionTeamsService.validateImport', () => {
    const service = (existing: { id: number, name: string }[]) => new EditionTeamsService(
        { find: async () => [{ id: 1, code: 'BAS', name: 'Básico' }, { id: 2, code: 'INT', name: 'Intermedio' }] } as any,
        new CsvService(),
        { getById: async () => ({ id: 9 }) } as any,
        {} as any,
        { getRepository: () => ({ find: async () => existing }) } as any,
    )

    it('empata la categoría sin acentos, marca los existentes como actualización y rechaza repetidos', async () => {
        const result = await service([{ id: 40, name: 'los bits' }]).validateImport(9, csv(
            '1,Los Bits,1,ANA,ISC,INTERMEDIO,modalidad_equipo',
            '2,Individual,2,JAVIER MORA,IME,BASICO,modalidad_individual',
            '3,Individual,3,JAVIER MORA,IME,BASICO,modalidad_individual',
        ))
        expect(result.preview.map((p) => [p.teamName, p.category.code, p.action])).toEqual([
            ['Los Bits', 'INT', 'update'],
            ['JAVIER MORA', 'BAS', 'create'],
        ])
        expect(result.errors).toEqual([{ row: 4, column: 'NombreEquipo', message: 'El equipo "JAVIER MORA" ya aparece en la fila 3' }])
    })

    it('repara acentos dañados y marca lo que llegó como � (no se puede adivinar)', async () => {
        const result = await service([]).validateImport(9, csv(
            '1,Los Ã‘andÃºes,1,JOSÃ‰ PEÃ‘A,ISC,BASICO,modalidad_equipo',
            '2,Individual,2,MAR\uFFFDA,IME,BASICO,modalidad_individual',
        ))
        expect(result.preview.map((p) => p.teamName)).toEqual(['Los Ñandúes', 'MAR\uFFFDA'])
        expect(result.errors).toEqual([{ row: 3, column: 'Nombre', message: '"MAR\uFFFDA" tiene caracteres dañados (�): corrige los acentos o la ñ en el archivo' }])
    })
})
