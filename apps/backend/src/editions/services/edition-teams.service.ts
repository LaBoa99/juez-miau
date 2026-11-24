import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CsvRow, CsvService } from '../../utils/services/csv.service.js';
import { CoolNames } from '../../utils/classes/cool-names.js';
import { TeamsService } from '../../teams/services/teams.service.js';
import { CreateTeamDto } from '../../teams/dtos/create-team.dto.js';
import { TeamFiltersDto } from '../../teams/dtos/team-filters.dto.js';
import { Category } from '../entities/category.entity.js';
import { Room } from '../entities/room.entity.js';
import { Team } from '../../teams/entities/team.entity.js';
import { EditionsService } from './editions.service.js';
import { HEARTBEAT_LOST_AFTER_MS } from '../../integrity/heartbeat.constants.js';

// Formato: NombreEquipo, Integrante1Nombre, Integrante1Carrera… hasta 3, Categoria, Usuario, Password
// Usuario y Password siempre vienen vacíos: se generan al importar
const COLUMNS = {
    teamName: 'NombreEquipo',
    category: 'Categoria',
} as const

const MAX_MEMBERS = 3
const memberColumns = (n: number) => ({ name: `Integrante${n}Nombre`, career: `Integrante${n}Carrera` })

// Integrante2 e Integrante3 son opcionales en la cabecera
const REQUIRED_COLUMNS = [
    COLUMNS.teamName,
    memberColumns(1).name,
    memberColumns(1).career,
    COLUMNS.category,
]

// Formato alterno (el de inscripciones): una fila por participante, agrupadas por "Nombre Equipo".
// Los que van solos traen Nombre Equipo = "Individual" (o Tipo = modalidad_individual): su equipo
// lleva su nombre completo
const PARTICIPANT = {
    team: 'Nombre Equipo',
    name: 'Nombre',
    career: 'Carrera',
    level: 'Nivel',
    type: 'Tipo',
} as const
const PARTICIPANT_REQUIRED = [PARTICIPANT.team, PARTICIPANT.name, PARTICIPANT.career, PARTICIPANT.level]

// Comparación de nombres y categorías: sin acentos, mayúsculas ni espacios de más
const plain = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

// Convierte participantes al formato de una fila por equipo; rowNumbers[i] es la fila real
// (la del primer integrante) para que los errores apunten al archivo
export function participantsToTeams(csvRows: CsvRow[]): { rows: CsvRow[], rowNumbers: number[], errors: ImportError[] } {
    const groups = new Map<string, { row: number, teamName: string, level: string, members: { name: string, career: string }[], bad: boolean }>()
    const errors: ImportError[] = []

    csvRows.forEach((csvRow, index) => {
        const row = index + 2
        const value = (column: string) => csvRow[column] ?? ''
        const individual = plain(value(PARTICIPANT.team)) === 'individual' || value(PARTICIPANT.type) === 'modalidad_individual'
        const teamName = individual ? value(PARTICIPANT.name) : value(PARTICIPANT.team)
        // Cada individual es su propio equipo, aunque dos se llamen igual (eso se marca después)
        const key = individual ? '#' + row : plain(teamName)

        let group = groups.get(key)
        if(!group){
            group = { row, teamName, level: value(PARTICIPANT.level), members: [], bad: false }
            groups.set(key, group)
        } else if(plain(group.level) !== plain(value(PARTICIPANT.level))){
            errors.push({ row, column: PARTICIPANT.level, message: `El nivel no coincide con el de los demás integrantes de "${teamName}" (fila ${group.row})` })
            group.bad = true
        }
        if(group.members.length === MAX_MEMBERS){
            errors.push({ row, column: PARTICIPANT.team, message: `El equipo "${teamName}" tiene más de ${MAX_MEMBERS} integrantes` })
            group.bad = true
        }
        group.members.push({ name: value(PARTICIPANT.name), career: value(PARTICIPANT.career) })
    })

    // Los equipos con error no se importan: los errores ya los explican
    const rows: CsvRow[] = []
    const rowNumbers: number[] = []
    for(const group of groups.values()){
        if(group.bad) continue
        const teamRow: CsvRow = { [COLUMNS.teamName]: group.teamName, [COLUMNS.category]: group.level }
        group.members.forEach((member, i) => {
            teamRow[memberColumns(i + 1).name] = member.name
            teamRow[memberColumns(i + 1).career] = member.career
        })
        rows.push(teamRow)
        rowNumbers.push(group.row)
    }
    return { rows, rowNumbers, errors }
}

const MAX_TEAM_NAME_LENGTH = 255
const USERNAME_ATTEMPTS = 20

export interface ImportError {
    row: number
    column: string | null
    message: string
}

export interface ImportCredential {
    teamName: string
    username: string
    password: string
}

interface ParsedTeamRow {
    row: number
    teamName: string
    category: Category
    members: { name: string, career: string }[]
    // Ya hay un equipo con ese nombre en la edición: se actualiza en vez de crear otro
    existingTeamId: number | null
}

interface ValidationResult {
    rows: ParsedTeamRow[]
    errors: ImportError[]
}

@Injectable()
export class EditionTeamsService {

    constructor(
        @InjectRepository(Category)
        private readonly categoryRepository: Repository<Category>,
        private readonly csvService: CsvService,
        private readonly editionService: EditionsService,
        private readonly teamsService: TeamsService,
        private readonly dataSource: DataSource,
    ) {}

    // Valida el CSV sin registrar nada (RF-09)
    async validateImport(editionId: number, csv: Buffer) {
        await this.editionService.getById(editionId)
        const { rows, errors } = await this.validateRows(editionId, this.csvService.parse(csv))

        return {
            validRows: rows.length,
            errors,
            preview: rows.map((row) => ({
                row: row.row,
                teamName: row.teamName,
                category: { id: row.category.id, code: row.category.code, name: row.category.name },
                members: row.members,
                action: row.existingTeamId ? 'update' as const : 'create' as const,
            })),
        }
    }

    // Registra solo las filas válidas. Los equipos que ya existen (mismo nombre) se actualizan y
    // conservan su usuario y contraseña, así que no salen en las credenciales
    async importFromCsv(editionId: number, csv: Buffer) {
        const edition = await this.editionService.getById(editionId)
        this.editionService.assertIsEditable(edition)

        const { rows, errors } = await this.validateRows(editionId, this.csvService.parse(csv))
        const credentials: ImportCredential[] = []

        let updated = 0

        if(rows.length === 0){
            return { created: 0, updated, errors, credentials }
        }

        const usedUsernames = new Set<string>()

        await this.dataSource.transaction(async (manager) => {
            for(const row of rows){
                if(row.existingTeamId){
                    await this.teamsService.replaceRoster(row.existingTeamId, row.category, row.members, manager)
                    updated++
                    continue
                }

                const username = await this.generateUsername(editionId, row.teamName, usedUsernames)

                const { team, password } = await this.teamsService.create(
                    edition,
                    row.category,
                    null, // el salón lo propone el backend según la categoría (reparte parejo)
                    { name: row.teamName, category_id: row.category.id, members: row.members },
                    { username, manager },
                )

                credentials.push({ teamName: team.name, username: team.username, password })
            }
        })

        return { created: credentials.length, updated, errors, credentials }
    }

    // Alta rápida de un equipo (sin CSV). Usuario y contraseña se generan al crear.
    async createTeam(editionId: number, dto: CreateTeamDto) {
        const edition = await this.editionService.getById(editionId)
        this.editionService.assertIsEditable(edition)

        const category = await this.categoryRepository.findOne({ where: { id: dto.category_id, edition_id: editionId } })
        if(!category){
            throw new NotFoundException(`La categoría no existe en la edición`)
        }

        // Sin salón elegido, el backend propone uno según la categoría
        const room = dto.room_id === undefined ? null : await this.dataSource.getRepository(Room).findOneBy({ id: dto.room_id, edition_id: editionId })
        if(dto.room_id !== undefined && !room){
            throw new NotFoundException('room #' + dto.room_id + ' not found in this edition')
        }

        const username = await this.generateUsername(editionId, dto.name, new Set())
        const { team, password } = await this.teamsService.create(edition, category, room, dto, { username })

        return {
            team: {
                id: team.id,
                name: team.name,
                username: team.username,
                category: { id: category.id, code: category.code, name: category.name },
                room: team.room ? { id: team.room.id, name: team.room.name } : null,
                members: team.members.map((member) => ({ id: member.id, name: member.full_name, career: member.career })),
                online: false,
                lastHeartbeatAt: null,
                signalLost: false,
                suspended: false,
            },
            credentials: { teamName: team.name, username: team.username, password },
        }
    }

    async findAllByEdition(editionId: number, filters: TeamFiltersDto) {
        await this.editionService.getById(editionId)
        const { teams, total } = await this.teamsService.findAllByEdition(editionId, filters)
        const now = Date.now()

        return {
            items: teams.map((team) => {
                const session = team.teamSession && !team.teamSession.ended_at ? team.teamSession : null
                return {
                    id: team.id,
                    name: team.name,
                    username: team.username,
                    category: team.category ? { id: team.category.id, code: team.category.code, name: team.category.name } : null,
                    room: team.room ? { id: team.room.id, name: team.room.name } : null,
                    members: team.members.map((member) => ({ id: member.id, name: member.full_name, career: member.career })),
                    online: !!session,
                    lastHeartbeatAt: session?.last_heartbeat_at ?? null,
                    // Una app cerrada de golpe deja la sesión abierta: "online" solo no dice si sigue ahí
                    signalLost: !!session && now - new Date(session.last_heartbeat_at).getTime() > HEARTBEAT_LOST_AFTER_MS,
                    suspended: team.suspended_at !== null,
                }
            }),
            total,
        }
    }

    private async validateRows(editionId: number, csvRows: CsvRow[]): Promise<ValidationResult> {
        const errors: ImportError[] = []

        // columnas: csv-parse ya garantiza que todas las filas tienen las mismas que la cabecera
        const header = csvRows.length > 0 ? Object.keys(csvRows[0]) : []
        const byParticipant = header.includes(PARTICIPANT.team)
        const required = byParticipant ? PARTICIPANT_REQUIRED : REQUIRED_COLUMNS
        const missing = csvRows.length > 0 ? required.filter((column) => !header.includes(column)) : []
        if(csvRows.length === 0){
            errors.push({ row: 1, column: null, message: 'El archivo no contiene equipos' })
        }
        for(const column of missing){
            errors.push({ row: 1, column, message: `Falta la columna ${column}` })
        }
        if(errors.length > 0){
            return { rows: [], errors }
        }

        // "�" = el archivo ya traía el texto dañado (acentos o ñ perdidos): no se puede adivinar qué decía
        csvRows.forEach((csvRow, index) => {
            for(const [column, text] of Object.entries(csvRow)){
                if(text.includes('\uFFFD')){
                    errors.push({ row: index + 2, column, message: `"${text}" tiene caracteres dañados (�): corrige los acentos o la ñ en el archivo` })
                }
            }
        })

        let rowNumbers: number[] | null = null
        if(byParticipant){
            const grouped = participantsToTeams(csvRows)
            csvRows = grouped.rows
            rowNumbers = grouped.rowNumbers
            errors.push(...grouped.errors)
        }

        const categories = await this.categoryRepository.find({ where: { edition_id: editionId } })
        const findCategory = (value: string) => {
            const needle = plain(value)
            return categories.find((c) => plain(c.code) === needle || plain(c.name) === needle)
        }

        // Equipos que ya están en la edición, por nombre
        const existing = new Map<string, number[]>()
        for(const team of await this.dataSource.getRepository(Team).find({ select: { id: true, name: true }, where: { edition_id: editionId } })){
            existing.set(plain(team.name), [...(existing.get(plain(team.name)) ?? []), team.id])
        }
        const seen = new Map<string, number>() // nombre → fila donde apareció primero

        const rows: ParsedTeamRow[] = []

        csvRows.forEach((csvRow, index) => {
            const row = rowNumbers?.[index] ?? index + 2 // la fila 1 es la cabecera
            const rowErrors: ImportError[] = []
            const addError = (column: string | null, message: string) => rowErrors.push({ row, column, message })
            const value = (column: string) => csvRow[column] ?? ''

            // nombre del equipo
            const teamName = value(COLUMNS.teamName)
            if(!teamName){
                addError(COLUMNS.teamName, 'El nombre del equipo es obligatorio')
            } else if(teamName.length > MAX_TEAM_NAME_LENGTH){
                addError(COLUMNS.teamName, `El nombre del equipo no puede exceder ${MAX_TEAM_NAME_LENGTH} caracteres`)
            } else if(seen.has(plain(teamName))){
                addError(COLUMNS.teamName, `El equipo "${teamName}" ya aparece en la fila ${seen.get(plain(teamName))}`)
            } else if((existing.get(plain(teamName))?.length ?? 0) > 1){
                addError(COLUMNS.teamName, `Hay varios equipos llamados "${teamName}" en la edición; no se sabe cuál actualizar`)
            }
            if(teamName && !seen.has(plain(teamName))) seen.set(plain(teamName), row)

            // integrantes (1 a 3)
            const members: ParsedTeamRow['members'] = []
            for(let n = 1; n <= MAX_MEMBERS; n++){
                const columns = memberColumns(n)
                const name = value(columns.name)
                const career = value(columns.career)

                if(!name && !career) continue
                if(!name){
                    addError(columns.name, `Falta el nombre del integrante ${n}`)
                } else if(!career){
                    addError(columns.career, `Falta la carrera del integrante ${n}`)
                } else {
                    members.push({ name, career })
                }
            }
            if(members.length === 0 && !rowErrors.some((e) => e.column?.startsWith('Integrante'))){
                addError(memberColumns(1).name, 'El equipo debe tener entre 1 y 3 integrantes')
            }

            // categoría (por código o nombre)
            const categoryValue = value(COLUMNS.category)
            const category = categoryValue ? findCategory(categoryValue) : undefined
            if(!categoryValue){
                addError(COLUMNS.category, 'La categoría es obligatoria')
            } else if(!category){
                addError(COLUMNS.category, `La categoría "${categoryValue}" no existe en la edición`)
            }

            if(rowErrors.length > 0){
                errors.push(...rowErrors)
                return
            }

            rows.push({
                row,
                teamName,
                category: category!,
                members,
                existingTeamId: existing.get(plain(teamName))?.[0] ?? null,
            })
        })

        return { rows, errors }
    }

    // Genera un usuario que no choque con los del CSV ni con los ya registrados en la edición
    private async generateUsername(editionId: number, teamName: string, used: Set<string>): Promise<string> {
        const base = teamName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9\s]/g, ' ').trim() || 'team'

        for(let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++){
            const candidate = CoolNames.coolUsername(base).slice(0, 60)
            const key = candidate.toLowerCase()
            if(used.has(key)) continue

            const taken = await this.teamsService.findTakenUsernames(editionId, [ candidate ])
            if(taken.size > 0) continue

            used.add(key)
            return candidate
        }

        // último recurso: sufijo aleatorio largo
        // shortcut: toString(36) puede incluir 0/1/l ambiguos; solo se llega aquí si las 6 variantes
        // de CoolNames ya colisionaron (USERNAME_ATTEMPTS agotados). Si llegara a pasar seguido, filtrar aquí también.
        const fallback = `team_${Date.now().toString(36)}${used.size}`
        used.add(fallback)
        return fallback
    }

}
