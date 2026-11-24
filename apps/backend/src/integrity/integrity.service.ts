import { Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EditionStatus, FlagType, SOCKET_EVENTS, type IHeartbeatResponse } from '@concurso/shared-types'
import { FlagsService, toFlagDto } from '../flags/flags.service.js'
import { RealtimeService } from '../realtime/realtime.service.js'
import { TeamSession } from '../teams/entities/team-session.entity.js'
import { Team } from '../teams/entities/team.entity.js'
import type { Edition } from '../editions/entities/edition.entity.js'
import { HeartbeatDto } from './dto/heartbeat.dto.js'
import { DISCONNECT_GRACE_MS, HEARTBEAT_EVERY_MS, HEARTBEAT_LOST_AFTER_MS } from './heartbeat.constants.js'

// "C:\\Tools\\Chrome.EXE" → "chrome"
export function normalizeProcessName(name: string): string {
    return name.trim().split(/[\\/]/).pop()!.toLowerCase().replace(/\.exe$/, '')
}

@Injectable()
export class IntegrityService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(IntegrityService.name)
    private readonly disconnectTimers = new Map<number, NodeJS.Timeout>()
    private readonly bootAt = Date.now()

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
        this.realtime.teamDisconnected.subscribe(({ teamId, sessionId }) => {
            const disconnectedAt = new Date()
            clearTimeout(this.disconnectTimers.get(teamId))
            const timer = setTimeout(() => {
                this.disconnectTimers.delete(teamId)
                this.confirmDisconnected(teamId, sessionId, disconnectedAt)
                    .catch((error) => this.logger.error('could not check disconnect of team #' + teamId + ': ' + String(error)))
            }, DISCONNECT_GRACE_MS)
            timer.unref()
            this.disconnectTimers.set(teamId, timer)
        })
    }

    onModuleDestroy(): void {
        this.disconnectTimers.forEach((timer) => clearTimeout(timer))
    }

    // Terminó la espera tras caerse el socket: alerta si la app no volvió por ningún canal.
    // Cerrar sesión, reemplazarla o una suspensión ya la terminaron y no son "sin señal"
    async confirmDisconnected(teamId: number, sessionId: string, disconnectedAt: Date): Promise<void> {
        if(await this.realtime.isTeamConnected(teamId, sessionId)) return
        const session = await this.sessionRepository.findOne({ where: { team_id: teamId }, relations: { team: { edition: true } } })
        if(!session || session.ended_at || session.session_id !== sessionId) return
        if(session.team.edition.status !== EditionStatus.RUNNING) return
        if(session.last_heartbeat_at > disconnectedAt) return

        await this.flagsService.raise(
            teamId,
            FlagType.HEARTBEAT_LOST,
            'La app se cerró o perdió la conexión: ' + disconnectedAt.toISOString(),
            '',
            undefined,
            session.last_heartbeat_at,
        )
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
        // Nombres normalizados que coincidieron: el cliente los cierra. No es el catálogo completo
        // (lo que nunca abrió no se manda), solo lo que ya está corriendo y es prohibido.
        const killProcesses: string[] = []
        for(const [normalized, name] of forbidden){
            if(running.has(normalized)){
                await this.flagsService.raise(teamId, FlagType.FORBIDDEN_PROCESS, 'Proceso prohibido en ejecución: ' + name, normalized)
                killProcesses.push(normalized)
            }
        }

        await this.checkHardware(teamId, team.edition, dto)

        // Sin el catálogo completo ni el estado de bloqueo: el equipo no debe saber qué se vigila
        return { nextHeartbeatMs: HEARTBEAT_EVERY_MS, ...(killProcesses.length ? { killProcesses } : {}) }
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
        // Mientras la API reiniciaba nadie pudo reportar: se les da una ventana completa
        if(now.getTime() - this.bootAt < HEARTBEAT_LOST_AFTER_MS) return 0

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
                '',
                undefined,
                new Date(session.lastHeartbeat),
            )
        }
        return stale.length
    }
}
