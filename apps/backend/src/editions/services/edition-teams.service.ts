import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CsvRow, CsvService } from '../../utils/services/csv.service.js';
import { CoolNames } from '../../utils/classes/cool-names.js';
import { TeamsService } from '../../teams/services/teams.service.js';
import { CreateTeamDto } from '../../teams/dtos/create-team.dto.js';
import { TeamFiltersDto } from '../../teams/dtos/team-filters.dto.js';
import { Category } from '../entities/category.entity.js';
import { EditionsService } from './editions.service.js';

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
            })),
        }
    }

    // Registra solo las filas válidas
    async importFromCsv(editionId: number, csv: Buffer) {
        const edition = await this.editionService.getById(editionId)
        this.editionService.assertIsEditable(edition)

        const { rows, errors } = await this.validateRows(editionId, this.csvService.parse(csv))
        const credentials: ImportCredential[] = []

        if(rows.length === 0){
            return { created: 0, errors, credentials }
        }

        const usedUsernames = new Set<string>()

        await this.dataSource.transaction(async (manager) => {
            for(const row of rows){
                const username = await this.generateUsername(editionId, row.teamName, usedUsernames)

                const { team, password } = await this.teamsService.create(
                    edition,
                    row.category,
                    null, // el salón se asigna después desde la edición
                    { name: row.teamName, category_id: row.category.id, members: row.members },
                    { username, manager },
                )

                credentials.push({ teamName: team.name, username: team.username, password })
            }
        })

        return { created: credentials.length, errors, credentials }
    }

    // Alta rápida de un equipo (sin CSV). Usuario y contraseña se generan al crear.
    async createTeam(editionId: number, dto: CreateTeamDto) {
        const edition = await this.editionService.getById(editionId)
        this.editionService.assertIsEditable(edition)

        const category = await this.categoryRepository.findOne({ where: { id: dto.category_id, edition_id: editionId } })
        if(!category){
            throw new NotFoundException(`La categoría no existe en la edición`)
        }

        const username = await this.generateUsername(editionId, dto.name, new Set())
        const { team, password } = await this.teamsService.create(edition, category, null, dto, { username })

        return {
            team: {
                id: team.id,
                name: team.name,
                username: team.username,
                category: { id: category.id, code: category.code, name: category.name },
                room: null,
                members: team.members.map((member) => ({ id: member.id, name: member.full_name, career: member.career })),
                online: false,
                suspended: false,
            },
            credentials: { teamName: team.name, username: team.username, password },
        }
    }

    async findAllByEdition(editionId: number, filters: TeamFiltersDto) {
        await this.editionService.getById(editionId)
        const { teams, total } = await this.teamsService.findAllByEdition(editionId, filters)

        return {
            items: teams.map((team) => ({
                id: team.id,
                name: team.name,
                username: team.username,
                category: team.category ? { id: team.category.id, code: team.category.code, name: team.category.name } : null,
                room: team.room ? { id: team.room.id, name: team.room.name } : null,
                members: team.members.map((member) => ({ id: member.id, name: member.full_name, career: member.career })),
                online: !!team.teamSession && !team.teamSession.ended_at,
                suspended: team.suspended_at !== null,
            })),
            total,
        }
    }

    private async validateRows(editionId: number, csvRows: CsvRow[]): Promise<ValidationResult> {
        const errors: ImportError[] = []

        // columnas: csv-parse ya garantiza que todas las filas tienen las mismas que la cabecera
        const header = csvRows.length > 0 ? Object.keys(csvRows[0]) : []
        const missing = csvRows.length > 0 ? REQUIRED_COLUMNS.filter((column) => !header.includes(column)) : []
        if(csvRows.length === 0){
            errors.push({ row: 1, column: null, message: 'El archivo no contiene equipos' })
        }
        for(const column of missing){
            errors.push({ row: 1, column, message: `Falta la columna ${column}` })
        }
        if(errors.length > 0){
            return { rows: [], errors }
        }

        const categories = await this.categoryRepository.find({ where: { edition_id: editionId } })
        const findCategory = (value: string) => {
            const needle = value.toLowerCase()
            return categories.find((c) => c.code.toLowerCase() === needle || c.name.toLowerCase() === needle)
        }

        const rows: ParsedTeamRow[] = []

        csvRows.forEach((csvRow, index) => {
            const row = index + 2 // la fila 1 es la cabecera
            const rowErrors: ImportError[] = []
            const addError = (column: string | null, message: string) => rowErrors.push({ row, column, message })
            const value = (column: string) => csvRow[column] ?? ''

            // nombre del equipo
            const teamName = value(COLUMNS.teamName)
            if(!teamName){
                addError(COLUMNS.teamName, 'El nombre del equipo es obligatorio')
            } else if(teamName.length > MAX_TEAM_NAME_LENGTH){
                addError(COLUMNS.teamName, `El nombre del equipo no puede exceder ${MAX_TEAM_NAME_LENGTH} caracteres`)
            }

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
        const fallback = `team_${Date.now().toString(36)}${used.size}`
        used.add(fallback)
        return fallback
    }

}
