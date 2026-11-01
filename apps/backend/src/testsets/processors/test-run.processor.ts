import { type OnApplicationBootstrap } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Job } from 'bullmq'
import { DataSource, Repository } from 'typeorm'
import { BlobsService } from '../../blobs/services/blobs.service.js'
import { JudgeService } from '../../judge/judge.service.js'
import { Language } from '../../languages/entities/language.entity.js'
import { Testset } from '../entities/testset.entity.js'
import { TestCase } from '../entities/test-case.entity.js'
import { TEST_RUN_QUEUE, type TestRunJob, type TestRunResult } from '../testsets.constants.js'

const PROGRESS_EVERY_MS = 250
// Al verificar, como al construir: la solución oficial corre con un límite holgado
const VERIFY_TIME_FACTOR = 10
const MAX_VERIFY_TIME_LIMIT_MS = 60_000

// Prueba del staff: juzga una solución contra un testset construido igual que un envío,
// pero no guarda nada; el resultado queda como valor de regreso del trabajo
@Processor(TEST_RUN_QUEUE)
export class TestRunProcessor extends WorkerHost implements OnApplicationBootstrap {

    constructor(
        @InjectRepository(Testset)
        private readonly testsetRepository: Repository<Testset>,
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

    async process(job: Job<TestRunJob>): Promise<TestRunResult> {
        const testset = await this.testsetRepository.findOneOrFail({
            where: { id: job.data.testsetId },
            relations: { problem: true, checker: { language: true } },
        })
        const { problem } = testset
        if(!problem.signature) throw new Error('problem #' + problem.id + ' has no signature')
        const language = await this.dataSource.getRepository(Language).findOneByOrFail({ id: job.data.languageId })

        // Mismo armado de casos que SubmissionProcessor.judge; al verificar todavía no hay salidas
        const verify = job.data.verify === true
        const cases = await this.testCaseRepository.find({ where: { testset_id: testset.id }, order: { ordinal: 'ASC' } })
        if(cases.length === 0 || (!verify && cases.some((testCase) => !testCase.output_sha))) throw new Error('testset #' + testset.id + ' is not built')
        const contents = await this.blobsService.getManyText(cases.flatMap((testCase) => verify ? [testCase.input_sha] : [testCase.input_sha, testCase.output_sha!]))
        const content = (sha: string) => {
            const text = contents.get(sha)
            if(text === undefined) throw new Error('blob ' + sha + ' of testset #' + testset.id + ' is missing')
            return text
        }

        await job.updateProgress({ judged: 0, total: cases.length })
        let lastProgress = 0
        const result = await this.judgeService.judge({
            language,
            signature: problem.signature,
            source: job.data.source,
            cases: cases.map((testCase) => ({ ordinal: testCase.ordinal, input: content(testCase.input_sha), expected: verify ? null : content(testCase.output_sha!) })),
            timeLimitMs: verify
                ? Math.min(Math.round(testset.time_limit_ms * language.time_multiplier) * VERIFY_TIME_FACTOR, MAX_VERIFY_TIME_LIMIT_MS)
                : Math.round(testset.time_limit_ms * language.time_multiplier),
            memoryLimitMb: testset.memory_limit_mb,
            compareMode: testset.compare_mode,
            floatTolerance: testset.float_tolerance,
            checker: testset.checker && { language: testset.checker.language, source: testset.checker.source.toString('utf8') },
            onProgress: (judged, total) => {
                if(Date.now() - lastProgress < PROGRESS_EVERY_MS && judged < total) return
                lastProgress = Date.now()
                void job.updateProgress({ judged, total })
            },
        })

        return {
            verdict: result.verdict,
            compileLog: result.compileLog,
            cases: result.cases.map((c) => ({
                ordinal: c.ordinal, verdict: c.verdict, timeMs: c.cpuMs, memoryKb: c.memoryKb, message: c.message,
                ...(verify && { input: content(cases.find((testCase) => testCase.ordinal === c.ordinal)!.input_sha), output: c.output }),
            })),
        }
    }
}
