import { Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Job } from 'bullmq'
import { DataSource, In, Repository } from 'typeorm'
import { SubmissionStatus, type ISubmissionProgress } from '@concurso/shared-types'
import { BlobsService } from '../../blobs/services/blobs.service.js'
import { JudgeInfrastructureError } from '../../judge/docker-runner.service.js'
import { JudgeService, type JudgeResult } from '../../judge/judge.service.js'
import { TestCase } from '../../testsets/entities/test-case.entity.js'
import { Submission } from '../entities/submission.entity.js'
import { SubmissionCase } from '../entities/submission-case.entity.js'
import { SUBMISSIONS_QUEUE, type SubmissionJob } from '../submissions.constants.js'

const PROGRESS_EVERY_MS = 250

export type SubmissionOutcome = 'judged' | 'error' | 'skipped'

// Juzga un envío contra el testset fijado al enviarlo. El resultado queda en la BD; la API se
// entera por el evento `completed` de la cola (judging-events)
@Processor(SUBMISSIONS_QUEUE)
export class SubmissionProcessor extends WorkerHost implements OnApplicationBootstrap {
    private readonly logger = new Logger(SubmissionProcessor.name)

    constructor(
        @InjectRepository(Submission)
        private readonly submissionRepository: Repository<Submission>,
        @InjectRepository(TestCase)
        private readonly testCaseRepository: Repository<TestCase>,
        private readonly dataSource: DataSource,
        private readonly blobsService: BlobsService,
        private readonly judgeService: JudgeService,
    ) {
        super()
    }

    onApplicationBootstrap(): void {
        this.worker.concurrency = this.judgeService.concurrency
    }

    async process(job: Job<SubmissionJob>): Promise<SubmissionOutcome> {
        const submission = await this.submissionRepository.findOne({
            where: { id: job.data.submissionId },
            relations: { language: true, testset: true, problem: true },
        })
        // Idempotente: un trabajo repetido no vuelve a juzgar (el rejudge lo regresa a QUEUED)
        if(!submission || ![SubmissionStatus.QUEUED, SubmissionStatus.JUDGING].includes(submission.status)) return 'skipped'

        try {
            const result = await this.judge(submission, job)
            await this.save(submission, result)
            return 'judged'
        } catch(error) {
            const attempts = job.opts.attempts ?? 1
            if(error instanceof JudgeInfrastructureError && job.attemptsMade + 1 < attempts){
                this.logger.warn('submission #' + submission.id + ' hit a system error, retrying: ' + error.message)
                await this.submissionRepository.update(submission.id, { status: SubmissionStatus.QUEUED })
                throw error
            }
            // Sin más intentos: queda en ERROR para que un juez lo re-juzgue. Se completa el trabajo
            // (no se marca fallido) para que la API reciba el evento y avise
            this.logger.error('submission #' + submission.id + ' could not be judged', error instanceof Error ? error.stack : undefined)
            await this.submissionRepository.update(submission.id, {
                status: SubmissionStatus.ERROR,
                compile_log: ('system error: ' + String(error)).slice(0, 4096),
                judged_at: new Date(),
            })
            return 'error'
        }
    }

    private async judge(submission: Submission, job: Job<SubmissionJob>): Promise<JudgeResult> {
        const { testset, problem, language } = submission
        if(!problem.signature) throw new Error('problem #' + problem.id + ' has no signature')

        const cases = await this.testCaseRepository.find({ where: { testset_id: testset.id }, order: { ordinal: 'ASC' } })
        const unbuilt = cases.find((testCase) => !testCase.output_sha)
        if(cases.length === 0 || unbuilt) throw new Error('testset #' + testset.id + ' is not built')

        const contents = await this.blobsService.getManyText(cases.flatMap((testCase) => [testCase.input_sha, testCase.output_sha!]))
        const content = (sha: string) => {
            const text = contents.get(sha)
            if(text === undefined) throw new Error('blob ' + sha + ' of testset #' + testset.id + ' is missing')
            return text
        }

        await this.submissionRepository.update(submission.id, { status: SubmissionStatus.JUDGING })
        await this.reportProgress(job, { submissionId: submission.id, judged: 0, total: cases.length })

        let lastProgress = 0
        return this.judgeService.judge({
            language,
            signature: problem.signature,
            source: submission.source.toString('utf8'),
            cases: cases.map((testCase) => ({
                ordinal: testCase.ordinal,
                input: content(testCase.input_sha),
                expected: content(testCase.output_sha!),
            })),
            timeLimitMs: Math.round(testset.time_limit_ms * language.time_multiplier),
            memoryLimitMb: testset.memory_limit_mb,
            compareMode: testset.compare_mode,
            floatTolerance: testset.float_tolerance,
            onProgress: (judged, total) => {
                if(Date.now() - lastProgress < PROGRESS_EVERY_MS && judged < total) return
                lastProgress = Date.now()
                void this.reportProgress(job, { submissionId: submission.id, judged, total })
            },
        })
    }

    private async save(submission: Submission, result: JudgeResult): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            await manager.delete(SubmissionCase, { submission_id: submission.id })
            if(result.cases.length > 0){
                await manager.insert(SubmissionCase, result.cases.map((testCase) => ({
                    submission_id: submission.id,
                    ordinal: testCase.ordinal,
                    verdict: testCase.verdict,
                    cpu_ms: testCase.cpuMs,
                    wall_ms: testCase.wallMs,
                    memory_kb: testCase.memoryKb,
                    message: testCase.message?.slice(0, 4096) ?? null,
                })))
            }
            await manager.update(Submission, { id: submission.id, status: In([SubmissionStatus.QUEUED, SubmissionStatus.JUDGING]) }, {
                status: SubmissionStatus.DONE,
                verdict: result.verdict,
                max_time_ms: result.cases.length > 0 ? result.maxTimeMs : null,
                max_memory_kb: result.cases.length > 0 ? result.maxMemoryKb : null,
                compile_log: result.compileLog?.slice(0, 8192) ?? null,
                judged_at: new Date(),
            })
        })
    }

    private async reportProgress(job: Job<SubmissionJob>, progress: ISubmissionProgress): Promise<void> {
        await job.updateProgress(progress as unknown as object).catch((error: unknown) => {
            this.logger.debug('could not report progress: ' + String(error))
        })
    }
}
