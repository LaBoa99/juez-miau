import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { DataSource, In } from 'typeorm'
import { SubmissionStatus, type Verdict } from '@concurso/shared-types'
import { Submission } from '../entities/submission.entity.js'
import { SUBMISSION_JOB_ATTEMPTS, SUBMISSIONS_QUEUE, submissionJobId, type SubmissionJob } from '../submissions.constants.js'

export interface RejudgeTarget {
    submissionIds?: number[]
    problemId?: number
    // Solo envíos con estos veredictos (vacío = todos)
    verdicts?: Verdict[]
}

export interface RejudgeOptions {
    reason: string
    // null: automático
    staffUserId: number | null
}

// Lo usan la API (envíos nuevos, rejudge manual) y el worker (rejudge automático al construir
// una versión nueva del testset de un problema publicado)
@Injectable()
export class SubmissionQueueService {
    private readonly logger = new Logger(SubmissionQueueService.name)

    constructor(
        @InjectQueue(SUBMISSIONS_QUEUE)
        private readonly queue: Queue<SubmissionJob>,
        private readonly dataSource: DataSource,
    ) {}

    async enqueue(submissionId: number, round: number): Promise<void> {
        await this.queue.add('judge', { submissionId, round }, {
            jobId: submissionJobId(submissionId, round),
            attempts: SUBMISSION_JOB_ATTEMPTS,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
        })
    }

    // Guarda el resultado anterior en submission_history y regresa los envíos a QUEUED con la
    // versión actual del testset de su problema y la ronda siguiente. Un trabajo de la ronda
    // anterior que siga corriendo ya no puede guardar su resultado. Regresa los envíos afectados
    async rejudge(target: RejudgeTarget, options: RejudgeOptions): Promise<Submission[]> {
        const ids = await this.dataSource.transaction(async (manager) => {
            const query = manager.createQueryBuilder(Submission, 'submission')
                .select('submission.id', 'id')
                .innerJoin('submission.problem', 'problem')
                .where('problem.current_testset_id IS NOT NULL')
                .setLock('pessimistic_write', undefined, ['submission'])
            if(target.submissionIds) query.andWhere('submission.id IN (:...ids)', { ids: target.submissionIds.length ? target.submissionIds : [0] })
            if(target.problemId !== undefined) query.andWhere('submission.problem_id = :problemId', { problemId: target.problemId })
            if(target.verdicts?.length) query.andWhere('submission.verdict IN (:...verdicts)', { verdicts: target.verdicts })

            const selected = (await query.getRawMany<{ id: number }>()).map((row) => row.id)
            if(selected.length === 0) return []

            await manager.query(
                `INSERT INTO submission_history (submission_id, judge_round, testset_id, status, verdict, max_time_ms, judged_at, reason, rejudged_by)
                 -- Cada tabla tiene su propio tipo enum (TypeORM): se convierte pasando por texto
                 SELECT id, judge_round, testset_id, status::text::submission_history_status_enum,
                        verdict::text::submission_history_verdict_enum, max_time_ms, judged_at, $2, $3
                 FROM submission WHERE id = ANY($1) AND status IN ('DONE', 'ERROR')`,
                [selected, options.reason, options.staffUserId],
            )
            await manager.query('DELETE FROM submission_case WHERE submission_id = ANY($1)', [selected])
            await manager.query(
                `UPDATE submission s
                 SET status = 'QUEUED', verdict = NULL, max_time_ms = NULL, max_memory_kb = NULL, compile_log = NULL,
                     judged_at = NULL, reviewed_by = NULL, reviewed_at = NULL, review_comment = NULL,
                     judge_round = s.judge_round + 1, testset_id = p.current_testset_id
                 FROM problem p
                 WHERE p.id = s.problem_id AND s.id = ANY($1)`,
                [selected],
            )
            return selected
        })
        if(ids.length === 0) return []

        const submissions = await this.dataSource.getRepository(Submission).find({
            where: { id: In(ids), status: SubmissionStatus.QUEUED },
            select: {
                id: true, edition_id: true, team_id: true, problem_id: true, language_id: true, testset_id: true,
                status: true, verdict: true, contest_ms: true, max_time_ms: true, max_memory_kb: true, compile_log: true,
                judge_round: true, reviewed_by: true, reviewed_at: true, review_comment: true, created_at: true, judged_at: true,
            },
            order: { id: 'ASC' },
        })
        // Si Redis falla quedan QUEUED y la API los vuelve a encolar al arrancar
        for(const submission of submissions){
            await this.enqueue(submission.id, submission.judge_round).catch((error: unknown) =>
                this.logger.error('could not enqueue the rejudge of submission #' + submission.id + ': ' + String(error)))
        }
        this.logger.log('rejudging ' + submissions.length + ' submission(s): ' + options.reason)
        return submissions
    }
}
