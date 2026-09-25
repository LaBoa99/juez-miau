import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TeamSession } from "../entities/team-session.entity.js";
import { Repository } from "typeorm";

@Injectable()
export class TeamSessionsService {

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

    // Cierra la sesión activa del equipo; si no tiene o ya estaba cerrada no hace nada
    async revoke(teamId: number, end_reason: string): Promise<void> {
        const teamSession = await this._teamSessionRepository.findOne({ where: { team_id: teamId }})
        if(!teamSession || teamSession.ended_at){
            return
        }

        teamSession.ended_at = new Date()
        teamSession.end_reason = end_reason
        await this._teamSessionRepository.save(teamSession)
    }
}
