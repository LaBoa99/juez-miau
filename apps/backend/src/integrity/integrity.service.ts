import { Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EditionStatus, FlagType, SOCKET_EVENTS, type IHeartbeatResponse } from '@concurso/shared-types'
import { FlagsService, toFlagDto } from '../flags/flags.service.js'
import { RealtimeService } from '../realtime/realtime.service.js'
import { TeamSession } from '../teams/entities/team-session.entity.js'
import { Team } from '../teams/entities/team.entity.js'
import type { Edition } from '../editions/entities/edition.entity.js'
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

        await this.checkHardware(teamId, team.edition, dto)

        // Sin la lista de prohibidos ni el estado de bloqueo: el equipo no debe saber qué se vigila
        return { nextHeartbeatMs: HEARTBEAT_EVERY_MS }
    }

    // Reglas de hardware de la edición; cada una se levanta una vez mientras su alerta siga abierta
    private async checkHardware(teamId: number, edition: Edition, dto: HeartbeatDto): Promise<void> {
        if(edition.max_monitors !== null && dto.monitors !== undefined && dto.monitors > edition.max_monitors){
            await this.flagsService.raise(teamId, FlagType.EXTRA_MONITOR,
                `${dto.monitors} monitores conectados (máximo ${edition.max_monitors})`, 'monitors')
        }
        if(edition.watch_usb_storage){
            for(const drive of dto.usbStorage ?? []){
                await this.flagsService.raise(teamId, FlagType.USB_STORAGE, 'Almacenamiento USB conectado: ' + drive, drive)
            }
        }
        if(edition.watch_network && dto.networkInterfaces){
            const session = await this.sessionRepository.findOne({ where: { team_id: teamId } })
            if(!session) return
            if(session.network_baseline === null){
                // El primer heartbeat de la sesión fija la base
                await this.sessionRepository.update({ team_id: teamId }, { network_baseline: dto.networkInterfaces })
                return
            }
            const baseline = new Set(session.network_baseline)
            for(const name of dto.networkInterfaces.filter((name) => !baseline.has(name))){
                await this.flagsService.raise(teamId, FlagType.NETWORK_CHANGE, 'Interfaz de red nueva: ' + name, name)
            }
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
