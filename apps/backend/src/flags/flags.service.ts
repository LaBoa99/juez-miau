import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository, type FindOptionsWhere } from 'typeorm'
import { FlagType, type IFlag } from '@concurso/shared-types'
import { Team } from '../teams/entities/team.entity.js'
import { Flag } from './entities/flag.entity.js'

export function toFlagDto(flag: Flag): IFlag {
    return {
        id: flag.id,
        editionId: flag.edition_id,
        teamId: flag.team_id,
        type: flag.type,
        details: flag.details,
        createdAt: flag.created_at,
        resolvedAt: flag.resolved_at,
        resolvedBy: flag.resolved_by,
        resolutionNote: flag.resolution_note,
    }
}

// No depende del socket (Auth la usa y Realtime depende de Auth): el módulo de integridad se
// registra con onChange para avisar al staff
@Injectable()
export class FlagsService {
    private readonly logger = new Logger(FlagsService.name)
    private readonly listeners: ((flag: Flag) => void)[] = []

    constructor(
        @InjectRepository(Flag)
        private readonly flagRepository: Repository<Flag>,
        @InjectRepository(Team)
        private readonly teamRepository: Repository<Team>,
    ) {}

    onChange(listener: (flag: Flag) => void): void {
        this.listeners.push(listener)
    }

    // Una sola alerta abierta por equipo, tipo y llave: un proceso prohibido que sigue abierto no
    // genera una alerta por heartbeat. Regresa null si ya existía
    // `editionId`: si se da, el equipo debe ser de esa edición (alertas manuales del staff)
    async raise(teamId: number, type: FlagType, details: string, dedupeKey = '', editionId?: number): Promise<Flag | null> {
        const team = await this.teamRepository.findOne({ where: { id: teamId }, select: { id: true, edition_id: true } })
        if(!team || (editionId !== undefined && team.edition_id !== editionId)){
            throw new NotFoundException('team not found #' + teamId + (editionId !== undefined ? ' in edition #' + editionId : ''))
        }

        const open = await this.flagRepository.existsBy({ team_id: teamId, type, dedupe_key: dedupeKey, resolved_at: IsNull() })
        if(open && type !== FlagType.MANUAL) return null

        const flag = await this.flagRepository.save(this.flagRepository.create({
            edition_id: team.edition_id,
            team_id: teamId,
            type,
            details,
            dedupe_key: dedupeKey,
        }))
        this.logger.warn('flag #' + flag.id + ' ' + type + ' for team #' + teamId + ': ' + details)
        this.notify(flag)
        return flag
    }

    async findForEdition(editionId: number, filters: { open?: boolean, teamId?: number }): Promise<IFlag[]> {
        const where: FindOptionsWhere<Flag> = { edition_id: editionId }
        if(filters.open) where.resolved_at = IsNull()
        if(filters.teamId !== undefined) where.team_id = filters.teamId
        const flags = await this.flagRepository.find({ where, order: { id: 'DESC' }, take: 500 })
        return flags.map(toFlagDto)
    }

    async hasOpen(teamId: number): Promise<boolean> {
        return this.flagRepository.existsBy({ team_id: teamId, resolved_at: IsNull() })
    }

    async getEditionId(flagId: number): Promise<number> {
        const flag = await this.flagRepository.findOne({ where: { id: flagId }, select: { id: true, edition_id: true } })
        if(!flag) throw new NotFoundException('flag not found #' + flagId)
        return flag.edition_id
    }

    async resolve(flagId: number, staffUserId: number, note: string | undefined): Promise<IFlag> {
        const flag = await this.flagRepository.findOneBy({ id: flagId })
        if(!flag) throw new NotFoundException('flag not found #' + flagId)

        const changes = { resolved_at: new Date(), resolved_by: staffUserId, resolution_note: note?.trim() || null }
        const result = await this.flagRepository.update({ id: flagId, resolved_at: IsNull() }, changes)
        if(!result.affected) throw new ConflictException('flag #' + flagId + ' is already resolved')

        Object.assign(flag, changes)
        this.notify(flag)
        return toFlagDto(flag)
    }

    private notify(flag: Flag): void {
        for(const listener of this.listeners){
            try {
                listener(flag)
            } catch(error) {
                this.logger.error('flag listener failed', error instanceof Error ? error.stack : undefined)
            }
        }
    }
}
