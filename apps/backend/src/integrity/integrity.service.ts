import { Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EditionStatus, FlagType, SOCKET_EVENTS, type IHeartbeatResponse } from '@concurso/shared-types'
import { FlagsService, toFlagDto } from '../flags/flags.service.js'
import { RealtimeService } from '../realtime/realtime.service.js'
import { TeamSession } from '../teams/entities/team-session.entity.js'
import { Team } from '../teams/entities/team.entity.js'
import { HeartbeatDto } from './dto/heartbeat.dto.js'

export const HEARTBEAT_EVERY_MS = 30_000
// Tres heartbeats perdidos seguidos
export const HEARTBEAT_LOST_AFTER_MS = 3 * HEARTBEAT_EVERY_MS

// "C:\\Tools\\Chrome.EXE" → "chrome"
export function normalizeProcessName(name: string): string {
    return name.trim().split(/[\\/]/).pop()!.toLowerCase().replace(/\.exe$/, '')
}

@Injectable()
export class IntegrityService implements OnModuleInit {

    constructor(
        @InjectRepository(Team)
        private readonly teamRepository: Repository<Team>,
        @InjectRepository(TeamSession)
        private readonly sessionRepository: Repository<TeamSession>,
        private readonly flagsService: FlagsService,
        private readonly realtime: RealtimeService,
    ) {}

    onModuleInit(): void {
        this.flagsService.onChange((flag) => this.realtime.toStaff(flag.edition_id, SOCKET_EVENTS.FLAG_UPDATE, toFlagDto(flag)))
    }

    // El cliente del concursante lo manda cada HEARTBEAT_EVERY_MS con los procesos abiertos
    async heartbeat(teamId: number, dto: HeartbeatDto): Promise<IHeartbeatResponse> {
        const team = await this.teamRepository.findOne({ where: { id: teamId }, relations: { edition: true } })
        if(!team) throw new NotFoundException('team not found #' + teamId)
        await this.sessionRepository.update({ team_id: teamId }, { last_heartbeat_at: new Date() })

        const forbidden = new Map(team.edition.forbidden_processes
            .filter((name) => name.trim())
            .map((name) => [normalizeProcessName(name), name]))
        const running = new Set((dto.processes ?? []).map(normalizeProcessName))
        for(const [normalized, name] of forbidden){
            if(running.has(normalized)){
                await this.flagsService.raise(teamId, FlagType.FORBIDDEN_PROCESS, 'Proceso prohibido en ejecución: ' + name, normalized)
            }
        }

        return {
            forbiddenProcesses: team.edition.forbidden_processes,
            nextHeartbeatMs: HEARTBEAT_EVERY_MS,
            submissionsBlocked: team.edition.block_submissions_on_alert && await this.flagsService.hasOpen(teamId),
        }
    }

    // Sesiones abiertas de ediciones corriendo que dejaron de mandar heartbeat
    async checkHeartbeats(now = new Date()): Promise<number> {
        const stale = await this.sessionRepository.createQueryBuilder('session')
            .innerJoin('session.team', 'team')
            .innerJoin('team.edition', 'edition')
            .select('session.team_id', 'teamId')
            .addSelect('session.last_heartbeat_at', 'lastHeartbeat')
            .where('session.ended_at IS NULL')
            .andWhere('edition.status = :status', { status: EditionStatus.RUNNING })
            .andWhere('session.last_heartbeat_at < :limit', { limit: new Date(now.getTime() - HEARTBEAT_LOST_AFTER_MS) })
            .getRawMany<{ teamId: number, lastHeartbeat: Date }>()

        for(const session of stale){
            await this.flagsService.raise(
                session.teamId,
                FlagType.HEARTBEAT_LOST,
                'Sin heartbeat desde ' + new Date(session.lastHeartbeat).toISOString(),
            )
        }
        return stale.length
    }
}
