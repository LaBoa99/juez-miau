import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThanOrEqual, Not, Repository, type FindOptionsWhere } from 'typeorm'
import { EditionStatus, SOCKET_EVENTS, type IContestClock } from '@concurso/shared-types'
import { Edition } from '../editions/entities/edition.entity.js'
import { RealtimeService } from '../realtime/realtime.service.js'
import { elapsedMs, remainingMs, toClockDto } from './clock.js'

// Transiciones SCHEDULED → RUNNING ⇄ PAUSED → FINISHED. Todas son updates condicionales sobre
// el estado, así dos peticiones (o el tick y un admin) no pueden aplicar la misma dos veces
@Injectable()
export class ContestClockService {
    private readonly logger = new Logger(ContestClockService.name)
    private readonly transitionListeners: ((editionId: number) => void)[] = []

    constructor(
        @InjectRepository(Edition)
        private readonly editionRepository: Repository<Edition>,
        private readonly realtime: RealtimeService,
    ) {}

    async getClock(editionId: number): Promise<IContestClock> {
        return toClockDto(await this.getEdition(editionId))
    }

    // Se puede iniciar a mano antes de la hora programada
    async start(editionId: number): Promise<IContestClock> {
        const now = new Date()
        return this.transition(editionId, [EditionStatus.SCHEDULED], () => ({
            status: EditionStatus.RUNNING,
            started_at: now,
            paused_at: null,
            paused_total_ms: 0,
        }))
    }

    async pause(editionId: number): Promise<IContestClock> {
        return this.transition(editionId, [EditionStatus.RUNNING], () => ({
            status: EditionStatus.PAUSED,
            paused_at: new Date(),
        }))
    }

    async resume(editionId: number): Promise<IContestClock> {
        return this.transition(editionId, [EditionStatus.PAUSED], (edition) => ({
            status: EditionStatus.RUNNING,
            paused_at: null,
            paused_total_ms: edition.paused_total_ms + (Date.now() - edition.paused_at!.getTime()),
        }))
    }

    // Desde una pausa, la pausa en curso se suma para que el tiempo final no la cuente
    async finish(editionId: number): Promise<IContestClock> {
        return this.transition(editionId, [EditionStatus.RUNNING, EditionStatus.PAUSED], (edition) => {
            const now = new Date()
            const pausedTotal = edition.paused_at
                ? edition.paused_total_ms + (now.getTime() - edition.paused_at.getTime())
                : edition.paused_total_ms
            // Si el tick llega tarde, el final queda en el instante en que se acabó el tiempo
            const end = Math.min(now.getTime(), edition.started_at!.getTime() + pausedTotal + edition.duration_ms)
            return {
                status: EditionStatus.FINISHED,
                paused_at: null,
                paused_total_ms: pausedTotal,
                finished_at: new Date(end),
            }
        })
    }

    // Lo llama el tick (ContestClockProcessor): arranca las programadas y termina las que se acabaron
    async tick(now = new Date()): Promise<void> {
        const due = await this.editionRepository.find({
            where: { status: EditionStatus.SCHEDULED, scheduled_start: LessThanOrEqual(now) },
            select: { id: true },
        })
        for(const { id } of due){
            await this.start(id).catch((error: unknown) => this.logger.warn('auto-start of edition #' + id + ' failed: ' + String(error)))
        }

        const running = await this.editionRepository.find({ where: { status: EditionStatus.RUNNING, started_at: Not(IsNull()) } })
        for(const edition of running.filter((edition) => remainingMs(edition, now) <= 0)){
            await this.finish(edition.id).catch((error: unknown) => this.logger.warn('auto-finish of edition #' + edition.id + ' failed: ' + String(error)))
        }
    }

    private async transition(
        editionId: number,
        from: EditionStatus[],
        changes: (edition: Edition) => Partial<Edition>,
    ): Promise<IContestClock> {
        const edition = await this.getEdition(editionId)
        if(!from.includes(edition.status)){
            throw new ConflictException('edition #' + editionId + ' is ' + edition.status + '; expected ' + from.join(' or '))
        }

        const update = changes(edition)
        const where: FindOptionsWhere<Edition> = { id: editionId, status: In(from) }
        const result = await this.editionRepository.update(where, update)
        if(!result.affected){
            throw new ConflictException('edition #' + editionId + ' changed while updating its clock; try again')
        }

        Object.assign(edition, update)
        const clock = toClockDto(edition)
        this.logger.log('edition #' + editionId + ' is ' + edition.status + ' at ' + Math.round(elapsedMs(edition) / 1000) + ' s')
        this.realtime.toPublic(editionId, SOCKET_EVENTS.CLOCK_UPDATE, clock)
        this.transitionListeners.forEach((listener) => listener(editionId))
        return clock
    }

    // El marcador se registra aquí: al terminar se descongela
    onTransition(listener: (editionId: number) => void): void {
        this.transitionListeners.push(listener)
    }

    private async getEdition(editionId: number): Promise<Edition> {
        const edition = await this.editionRepository.findOneBy({ id: editionId })
        if(!edition) throw new NotFoundException('edition not found #' + editionId)
        return edition
    }
}
