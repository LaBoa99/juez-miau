import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EditionStatus, ProblemStatus, SOCKET_EVENTS, type IClarification, type IStaffClarification } from '@concurso/shared-types'
import { Problem } from '../problems/entities/problem.entity.js'
import { RealtimeService } from '../realtime/realtime.service.js'
import { Team } from '../teams/entities/team.entity.js'
import { Clarification } from './entities/clarification.entity.js'
import type { AnswerClarificationDto, CreateClarificationDto } from './dto/clarification.dto.js'

const OPEN_STATUSES = [EditionStatus.RUNNING, EditionStatus.PAUSED]

// Con teamId se marca si es del equipo que la pide; sin él (evento público) no se dice de quién es
export function toClarificationDto(c: Clarification, teamId?: number): IClarification {
    return {
        id: c.id,
        problemId: c.problem_id,
        question: c.question,
        answer: c.answer,
        createdAt: c.created_at,
        answeredAt: c.answered_at,
        ...(teamId !== undefined ? { mine: c.team_id === teamId } : {}),
    }
}

export function toStaffClarificationDto(c: Clarification): IStaffClarification {
    return { ...toClarificationDto(c), teamId: c.team_id, teamName: c.team.name, answeredBy: c.answered_by }
}

@Injectable()
export class ClarificationsService {

    constructor(
        @InjectRepository(Clarification) private readonly clarificationRepository: Repository<Clarification>,
        @InjectRepository(Team) private readonly teamRepository: Repository<Team>,
        @InjectRepository(Problem) private readonly problemRepository: Repository<Problem>,
        private readonly realtime: RealtimeService,
    ) {}

    async ask(teamId: number, dto: CreateClarificationDto): Promise<IClarification> {
        const team = await this.teamRepository.findOne({ where: { id: teamId }, relations: { edition: true } })
        if(!team) throw new NotFoundException('team not found #' + teamId)
        if(!OPEN_STATUSES.includes(team.edition.status)){
            throw new ConflictException('el concurso no está en curso')
        }
        if(dto.problemId){
            // Solo problemas que el equipo puede ver: publicados y de su categoría
            const visible = await this.problemRepository.existsBy({
                id: dto.problemId, edition_id: team.edition_id, category_id: team.category_id, status: ProblemStatus.PUBLISHED,
            })
            if(!visible) throw new NotFoundException('problem not found #' + dto.problemId)
        }

        const saved = await this.clarificationRepository.save(this.clarificationRepository.create({
            edition_id: team.edition_id, team_id: team.id, problem_id: dto.problemId ?? null, question: dto.question,
        }))
        saved.team = team
        this.realtime.toStaff(team.edition_id, SOCKET_EVENTS.CLARIFICATION_UPDATE, toStaffClarificationDto(saved))
        return toClarificationDto(saved, team.id)
    }

    // Las propias (respondidas o no) y todas las respondidas de la edición que sean generales o de su categoría
    async listForTeam(teamId: number): Promise<IClarification[]> {
        const team = await this.teamRepository.findOneBy({ id: teamId })
        if(!team) throw new NotFoundException('team not found #' + teamId)
        const rows = await this.clarificationRepository.createQueryBuilder('c')
            .leftJoin('c.problem', 'p')
            .where('c.edition_id = :edition', { edition: team.edition_id })
            .andWhere('(c.team_id = :team OR c.answered_at IS NOT NULL)', { team: team.id })
            .andWhere('(c.problem_id IS NULL OR p.category_id = :category)', { category: team.category_id })
            .orderBy('c.id', 'DESC')
            .getMany()
        return rows.map((row) => toClarificationDto(row, team.id))
    }

    async listForStaff(editionId: number): Promise<IStaffClarification[]> {
        const rows = await this.clarificationRepository.find({
            where: { edition_id: editionId }, relations: { team: true }, order: { id: 'DESC' },
        })
        return rows.map(toStaffClarificationDto)
    }

    // Responder de nuevo reemplaza la respuesta (para corregirla)
    async answer(editionId: number, id: number, userId: number, dto: AnswerClarificationDto): Promise<IStaffClarification> {
        const clarification = await this.clarificationRepository.findOne({ where: { id, edition_id: editionId }, relations: { team: true } })
        if(!clarification) throw new NotFoundException('clarification not found #' + id)

        clarification.answer = dto.answer
        clarification.answered_by = userId
        clarification.answered_at = new Date()
        await this.clarificationRepository.save(clarification)

        const staff = toStaffClarificationDto(clarification)
        this.realtime.toStaff(editionId, SOCKET_EVENTS.CLARIFICATION_UPDATE, staff)
        // Sin el equipo que preguntó; cada cliente descarta las de problemas de otra categoría
        this.realtime.toPublic(editionId, SOCKET_EVENTS.CLARIFICATION_UPDATE, toClarificationDto(clarification))
        return staff
    }
}
