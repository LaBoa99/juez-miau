import { Injectable, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EditionStatus, ProblemStatus, SOCKET_EVENTS, type IStandings } from '@concurso/shared-types'
import { freezeStartMs, isFrozen } from '../contest-clock/clock.js'
import { ContestClockService } from '../contest-clock/contest-clock.service.js'
import { Category } from '../editions/entities/category.entity.js'
import { Edition } from '../editions/entities/edition.entity.js'
import { Problem } from '../problems/entities/problem.entity.js'
import { RealtimeService } from '../realtime/realtime.service.js'
import { Submission } from '../submissions/entities/submission.entity.js'
import { SubmissionsService } from '../submissions/services/submissions.service.js'
import { Team } from '../teams/entities/team.entity.js'
import { TeamSessionsService } from '../teams/services/team-sessions.service.js'
import { computeStandings } from './icpc.js'

export type StandingsView = 'public' | 'staff'

// Varios veredictos seguidos se juntan en un solo recálculo y un solo evento
const PUSH_DEBOUNCE_MS = 1_000

// Para un concurso universitario (cientos de equipos, miles de envíos) basta con recalcular todo
// desde los envíos; el resultado se guarda en memoria hasta el siguiente cambio de la edición
@Injectable()
export class StandingsService implements OnModuleInit, OnModuleDestroy {
    private readonly cache = new Map<string, IStandings>()
    private readonly pushTimers = new Map<number, NodeJS.Timeout>()

    constructor(
        @InjectRepository(Edition)
        private readonly editionRepository: Repository<Edition>,
        @InjectRepository(Category)
        private readonly categoryRepository: Repository<Category>,
        @InjectRepository(Team)
        private readonly teamRepository: Repository<Team>,
        @InjectRepository(Problem)
        private readonly problemRepository: Repository<Problem>,
        @InjectRepository(Submission)
        private readonly submissionRepository: Repository<Submission>,
        private readonly submissionsService: SubmissionsService,
        private readonly clockService: ContestClockService,
        private readonly realtime: RealtimeService,
        private readonly teamSessionsService: TeamSessionsService,
    ) {}

    onModuleInit(): void {
        this.submissionsService.onChange((submission) => this.changed(submission.edition_id))
        this.clockService.onTransition((editionId) => this.changed(editionId))
    }

    onModuleDestroy(): void {
        this.pushTimers.forEach((timer) => clearTimeout(timer))
    }

    // La pública no existe mientras la edición es borrador
    async getPublic(editionId: number): Promise<IStandings> {
        const edition = await this.getEdition(editionId)
        if(edition.status === EditionStatus.DRAFT) throw new NotFoundException('edition not found #' + editionId)
        return this.get(edition, 'public')
    }

    async getForStaff(editionId: number): Promise<IStandings> {
        return this.get(await this.getEdition(editionId), 'staff')
    }

    private async get(edition: Edition, view: StandingsView): Promise<IStandings> {
        // Al cruzar el minuto de congelamiento cambia la llave aunque no haya envíos nuevos
        const frozen = view === 'public' && isFrozen(edition)
        const key = edition.id + ':' + view + ':' + frozen
        const cached = this.cache.get(key)
        if(cached) return cached

        const [categories, teams, problems, submissions] = await Promise.all([
            this.categoryRepository.find({ where: { edition_id: edition.id }, order: { sort_order: 'ASC', id: 'ASC' } }),
            this.teamRepository.find({ where: { edition_id: edition.id }, select: { id: true, name: true, category_id: true, suspended_at: true } }),
            this.problemRepository.find({
                where: { edition_id: edition.id, status: ProblemStatus.PUBLISHED },
                select: { id: true, letter: true, title: true, category_id: true },
            }),
            this.submissionRepository.find({
                where: { edition_id: edition.id },
                select: { id: true, team_id: true, problem_id: true, status: true, verdict: true, contest_ms: true },
            }),
        ])

        const freezeMs = frozen ? freezeStartMs(edition) : null
        const standings: IStandings = {
            editionId: edition.id,
            view,
            frozen,
            freezeMinute: edition.freeze_duration_ms > 0 ? Math.floor(freezeStartMs(edition) / 60_000) : null,
            generatedAt: new Date().toISOString(),
            categories: computeStandings({
                categories, problems, submissions,
                teams: teams.map((team) => ({ ...team, suspended: team.suspended_at !== null })),
            }, freezeMs),
        }
        this.cache.set(key, standings)
        return standings
    }

    // Staff: suspende o reactiva un equipo; el marcador se recalcula y se manda por socket
    async setSuspended(editionId: number, teamId: number, suspended: boolean): Promise<void> {
        const result = await this.teamRepository.update({ id: teamId, edition_id: editionId }, { suspended_at: suspended ? new Date() : null })
        if(!result.affected) throw new NotFoundException('team not found #' + teamId)
        // Suspendido no puede seguir: se cierra su sesión (su app vuelve al login) y ya no puede entrar ni enviar
        if(suspended) await this.teamSessionsService.revoke(teamId, 'suspended')
        this.changed(editionId)
    }

    private changed(editionId: number): void {
        for(const key of this.cache.keys()){
            if(key.startsWith(editionId + ':')) this.cache.delete(key)
        }

        if(this.pushTimers.has(editionId)) return
        const timer = setTimeout(() => {
            this.pushTimers.delete(editionId)
            void this.push(editionId)
        }, PUSH_DEBOUNCE_MS)
        timer.unref()
        this.pushTimers.set(editionId, timer)
    }

    private async push(editionId: number): Promise<void> {
        const edition = await this.editionRepository.findOneBy({ id: editionId })
        if(!edition) return
        if(edition.status !== EditionStatus.DRAFT){
            this.realtime.toPublic(editionId, SOCKET_EVENTS.STANDINGS_UPDATE, await this.get(edition, 'public'))
        }
        this.realtime.toStaff(editionId, SOCKET_EVENTS.STANDINGS_UPDATE, await this.get(edition, 'staff'))
    }

    private async getEdition(editionId: number): Promise<Edition> {
        const edition = await this.editionRepository.findOneBy({ id: editionId })
        if(!edition) throw new NotFoundException('edition not found #' + editionId)
        return edition
    }
}
