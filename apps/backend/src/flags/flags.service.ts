import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThan, Repository, type FindOptionsWhere } from 'typeorm'
import { EditionStatus, FlagOutcome, FlagType, type IFlag } from '@concurso/shared-types'
import { elapsedMs } from '../contest-clock/clock.js'
import { Edition } from '../editions/entities/edition.entity.js'
import { Team } from '../teams/entities/team.entity.js'
import { Flag } from './entities/flag.entity.js'

// Sin detectarse por más de este tiempo, la condición ya terminó y volver a verla es otro incidente.
// Cubre el heartbeat y la revisión de señal perdida (10 s cada uno), aunque se pierdan algunos
const SAME_INCIDENT_MS = 45_000
// Tras confirmar una falta, tiempo para corregirla; si después se sigue detectando es reincidencia
const REPEAT_GRACE_MS = 120_000
const LOGOUT_KEY = 'logout'
const LOGOUT_PENDING = 'Cerró sesión durante el concurso y aún no vuelve.'

// Si la detección nueva pertenece a la última alerta de ese tipo y llave
function isSameIncident(last: Pick<Flag, 'resolved_at' | 'last_seen_at' | 'outcome'>, type: FlagType, now: Date, endedAt?: Date): boolean {
    if(!last.resolved_at) return true
    // La condición terminó después de la última detección (la app volvió a reportar): esto es otro cierre
    if(endedAt && last.last_seen_at < endedAt) return false
    // Cambiar de máquina o cerrar sesión son hechos puntuales: si se repiten, es otro incidente
    if(type === FlagType.SESSION_REPLACED || type === FlagType.SESSION_CLOSED) return false
    if(last.outcome === FlagOutcome.CONFIRMED) return now.getTime() - last.resolved_at.getTime() < REPEAT_GRACE_MS
    return now.getTime() - last.last_seen_at.getTime() < SAME_INCIDENT_MS
}

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
        outcome: flag.outcome ?? null,
        offense: flag.offense ?? 1,
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

    // Una alerta por incidente: un proceso prohibido que sigue abierto no genera una por heartbeat,
    // ni otra después de que el juez la resolvió (penalizaría dos veces lo mismo). Regresa null si ya existía
    // `editionId`: si se da, el equipo debe ser de esa edición (alertas manuales del staff)
    // `endedAt`: última vez que se supo que la condición no estaba (último heartbeat, para "sin señal")
    async raise(teamId: number, type: FlagType, details: string, dedupeKey = '', editionId?: number, endedAt?: Date): Promise<Flag | null> {
        const team = await this.teamRepository.findOne({ where: { id: teamId }, select: { id: true, edition_id: true } })
        if(!team || (editionId !== undefined && team.edition_id !== editionId)){
            throw new NotFoundException('team not found #' + teamId + (editionId !== undefined ? ' in edition #' + editionId : ''))
        }

        let offense = 1
        if(type !== FlagType.MANUAL){
            const where = { team_id: teamId, type, dedupe_key: dedupeKey }
            const last = await this.flagRepository.findOne({
                where,
                order: { id: 'DESC' },
                select: { id: true, resolved_at: true, last_seen_at: true, outcome: true },
            })
            const now = new Date()
            if(last && isSameIncident(last, type, now, endedAt)){
                await this.flagRepository.update(last.id, { last_seen_at: now })
                return null
            }
            offense += await this.flagRepository.countBy({ ...where, outcome: FlagOutcome.CONFIRMED })
        }

        const flag = await this.flagRepository.save(this.flagRepository.create({
            edition_id: team.edition_id,
            team_id: teamId,
            type,
            details,
            dedupe_key: dedupeKey,
            offense,
            last_seen_at: new Date(),
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

    // Una reincidencia sin decidir frena los envíos aunque la edición no bloquee por cualquier alerta
    async hasOpenRepeat(teamId: number): Promise<boolean> {
        return this.flagRepository.existsBy({ team_id: teamId, resolved_at: IsNull(), offense: MoreThan(1) })
    }

    // Fuera de sesión no hay heartbeat: sin esta alerta, salir y volver a entrar evadiría la vigilancia
    async teamLoggedOut(teamId: number): Promise<void> {
        const team = await this.teamRepository.findOne({ where: { id: teamId }, relations: { edition: true } })
        if(team?.edition.status !== EditionStatus.RUNNING && team?.edition.status !== EditionStatus.PAUSED) return
        if(await this.raise(teamId, FlagType.SESSION_CLOSED, LOGOUT_PENDING, LOGOUT_KEY)) return

        // Ya tenía una abierta: vuelve a quedar como "aún no vuelve"
        const open = await this.flagRepository.findOneBy({ team_id: teamId, type: FlagType.SESSION_CLOSED, resolved_at: IsNull() })
        if(!open) return
        open.details = LOGOUT_PENDING
        this.notify(await this.flagRepository.save(open))
    }

    async teamReturned(teamId: number, awayMs: number): Promise<void> {
        const flag = await this.flagRepository.findOne({
            where: { team_id: teamId, type: FlagType.SESSION_CLOSED, details: LOGOUT_PENDING },
            order: { id: 'DESC' },
        })
        if(!flag) return
        const seconds = Math.max(0, Math.round(awayMs / 1000))
        flag.details = `Cerró sesión durante el concurso y volvió después de ${Math.floor(seconds / 60)} min ${seconds % 60} s.`
        this.notify(await this.flagRepository.save(flag))
    }

    async getEditionId(flagId: number): Promise<number> {
        const flag = await this.flagRepository.findOne({ where: { id: flagId }, select: { id: true, edition_id: true } })
        if(!flag) throw new NotFoundException('flag not found #' + flagId)
        return flag.edition_id
    }

    // Decide una alerta abierta o corrige una decisión anterior (afecta el marcador: debe poder deshacerse)
    async resolve(flagId: number, staffUserId: number, outcome: FlagOutcome, note: string | undefined): Promise<IFlag> {
        const flag = await this.flagRepository.findOneBy({ id: flagId })
        if(!flag) throw new NotFoundException('flag not found #' + flagId)
        if(flag.outcome === outcome) throw new ConflictException('flag #' + flagId + ' is already ' + outcome)

        const edition = await this.flagRepository.manager.findOneByOrFail(Edition, { id: flag.edition_id })
        const changes = {
            outcome,
            outcome_contest_ms: outcome === FlagOutcome.CONFIRMED ? elapsedMs(edition) : null,
            resolved_at: new Date(),
            resolved_by: staffUserId,
            resolution_note: note?.trim() || flag.resolution_note,
        }
        // Condicional: dos jueces decidiendo la misma alerta a la vez
        const result = await this.flagRepository.update({ id: flagId, outcome: flag.outcome ?? IsNull() }, changes)
        if(!result.affected) throw new ConflictException('flag #' + flagId + ' was already decided')

        Object.assign(flag, changes)
        this.notify(flag)
        return toFlagDto(flag)
    }

    // Alertas confirmadas por equipo. `beforeMs`: solo las confirmadas antes de ese tiempo (marcador congelado)
    async confirmedCounts(editionId: number, beforeMs: number | null): Promise<Map<number, number>> {
        const flags = await this.flagRepository.find({
            where: { edition_id: editionId, outcome: FlagOutcome.CONFIRMED },
            select: { id: true, team_id: true, outcome_contest_ms: true },
        })
        const counts = new Map<number, number>()
        for(const flag of flags){
            if(beforeMs !== null && (flag.outcome_contest_ms ?? 0) >= beforeMs) continue
            counts.set(flag.team_id, (counts.get(flag.team_id) ?? 0) + 1)
        }
        return counts
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
