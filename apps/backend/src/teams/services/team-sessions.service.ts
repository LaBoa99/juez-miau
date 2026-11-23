import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { TeamSession } from "../entities/team-session.entity.js";
import { Repository } from "typeorm";
import { Subject } from "rxjs";

export const TEAM_SUSPENDED_MESSAGE = 'Tu equipo fue suspendido por los jueces'

export interface StartedTeamSession {
    session: TeamSession
    // Sesión que seguía abierta y quedó reemplazada por este login (null si no había)
    replaced: Pick<TeamSession, 'machine_id' | 'started_at'> | null
    // Cuándo salió el equipo por su cuenta, si este login es su regreso
    loggedOutAt: Date | null
}

// Sesión vigente de un equipo después de un login (id nuevo) o de cerrarla (null)
export interface TeamSessionChange {
    teamId: number
    activeSessionId: string | null
}

@Injectable()
export class TeamSessionsService {

    // El gateway de tiempo real escucha esto para desconectar los sockets de sesiones viejas
    readonly changes = new Subject<TeamSessionChange>()

    constructor(
        @InjectRepository(TeamSession)
        private readonly _teamSessionRepository: Repository<TeamSession>
    ) {

    }

    async getById(teamId: number){
        const teamSession = await this._teamSessionRepository.findOne({ where: { team_id: teamId }})
        if(!teamSession){
            throw new NotFoundException("team session not found #" + teamId)
        }

        return teamSession
    }

    // Una sola sesión por equipo: un login nuevo reemplaza la anterior
    async start(teamId: number, machineId: string): Promise<StartedTeamSession> {
        const previous = await this._teamSessionRepository.findOne({ where: { team_id: teamId }})
        const replaced = previous && !previous.ended_at
            ? { machine_id: previous.machine_id, started_at: previous.started_at }
            : null
        const loggedOutAt = previous?.end_reason === 'logout' ? previous.ended_at : null

        const now = new Date()
        const session = this._teamSessionRepository.create({
            team_id: teamId,
            session_id: randomUUID(),
            machine_id: machineId,
            started_at: now,
            last_heartbeat_at: now,
            ended_at: null,
            end_reason: null,
            network_baseline: null,
        })

        const saved = await this._teamSessionRepository.save(session)
        this.changes.next({ teamId, activeSessionId: saved.session_id })
        return { session: saved, replaced, loggedOutAt }
    }

    async assertActive(teamId: number, sessionId: string | undefined): Promise<void> {
        const teamSession = await this._teamSessionRepository.findOne({ where: { team_id: teamId }})
        if(!sessionId || !teamSession || teamSession.ended_at || teamSession.session_id !== sessionId){
            // Solo la sesión que cerró la suspensión recibe este motivo; un token más viejo sigue con el genérico
            if(teamSession?.session_id === sessionId && teamSession?.end_reason === 'suspended'){
                throw new UnauthorizedException(TEAM_SUSPENDED_MESSAGE)
            }
            throw new UnauthorizedException('La sesión del equipo se cerró o se abrió en otro equipo, vuelve a iniciar sesión')
        }
    }

    // Cierra la sesión activa del equipo; si no tiene o ya estaba cerrada no hace nada.
    // Con sessionId solo la cierra si sigue siendo esa sesión (logout de un token viejo no cierra la nueva).
    // Regresa si cerró una sesión
    async revoke(teamId: number, end_reason: string, sessionId?: string): Promise<boolean> {
        const teamSession = await this._teamSessionRepository.findOne({ where: { team_id: teamId }})
        if(!teamSession || teamSession.ended_at){
            return false
        }
        if(sessionId && teamSession.session_id !== sessionId){
            return false
        }

        teamSession.ended_at = new Date()
        teamSession.end_reason = end_reason
        await this._teamSessionRepository.save(teamSession)
        this.changes.next({ teamId, activeSessionId: null })
        return true
    }
}
