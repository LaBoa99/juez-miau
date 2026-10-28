import { Logger } from '@nestjs/common'
import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SOCKET_EVENTS, type ISubmissionProgress } from '@concurso/shared-types'
import { RealtimeService } from '../realtime/realtime.service.js'
import { Submission } from '../submissions/entities/submission.entity.js'
import { SubmissionsService } from '../submissions/services/submissions.service.js'
import { SUBMISSIONS_QUEUE, submissionIdFromJob } from '../submissions/submissions.constants.js'

export interface VerdictListener {
    onSubmissionJudged(submission: Submission): void
}

// El worker no tiene WebSocket: avisa con eventos de la cola (QueueEvents de BullMQ) y la API
// los reenvía por Socket.io. El estado siempre se lee de la BD, el evento solo dice qué cambió
@QueueEventsListener(SUBMISSIONS_QUEUE)
export class JudgingEventsListener extends QueueEventsHost {
    private readonly logger = new Logger(JudgingEventsListener.name)
    private readonly verdictListeners: VerdictListener[] = []

    constructor(
        @InjectRepository(Submission)
        private readonly submissionRepository: Repository<Submission>,
        private readonly submissionsService: SubmissionsService,
        private readonly realtime: RealtimeService,
    ) {
        super()
    }

    // El marcador se registra aquí para recalcular con cada veredicto
    addVerdictListener(listener: VerdictListener): void {
        this.verdictListeners.push(listener)
    }

    @OnQueueEvent('progress')
    async onProgress({ jobId, data }: { jobId: string, data: unknown }): Promise<void> {
        const progress = data as ISubmissionProgress
        const submission = await this.load(jobId, false)
        if(!submission) return

        // El primer progreso llega cuando el worker ya lo marcó JUDGING
        if(progress.judged === 0) this.submissionsService.publish(submission)

        this.realtime.toTeam(submission.team_id, SOCKET_EVENTS.SUBMISSION_PROGRESS, progress)
        this.realtime.toStaff(submission.edition_id, SOCKET_EVENTS.SUBMISSION_PROGRESS, progress)
    }

    @OnQueueEvent('completed')
    async onCompleted({ jobId }: { jobId: string }): Promise<void> {
        const submission = await this.load(jobId, true)
        if(!submission) return

        this.submissionsService.publish(submission)
        for(const listener of this.verdictListeners){
            try {
                listener.onSubmissionJudged(submission)
            } catch(error) {
                this.logger.error('verdict listener failed', error instanceof Error ? error.stack : undefined)
            }
        }
    }

    private async load(jobId: string, withCases: boolean): Promise<Submission | null> {
        const id = submissionIdFromJob(jobId)
        if(id === null) return null
        return this.submissionRepository.findOne({
            where: { id },
            relations: withCases ? { cases: true } : undefined,
            select: {
                id: true, edition_id: true, team_id: true, problem_id: true, language_id: true, testset_id: true,
                status: true, verdict: true, contest_ms: true, max_time_ms: true, max_memory_kb: true,
                compile_log: true, created_at: true, judged_at: true,
            },
        })
    }
}
