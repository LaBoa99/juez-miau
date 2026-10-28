import { Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Job } from 'bullmq'
import { DataSource, Repository } from 'typeorm'
import { CompareMode, ProblemStatus, TestCaseOrigin, TestCaseVisibility, TestsetStatus, Verdict, type IProblemSignature } from '@concurso/shared-types'
import { BlobsService } from '../../blobs/services/blobs.service.js'
import { Problem } from '../../problems/entities/problem.entity.js'
import { hasDriver } from '../../judge/drivers/index.js'
import { JudgeService, type JudgeResult } from '../../judge/judge.service.js'
import { SubmissionQueueService } from '../../submissions/services/submission-queue.service.js'
import { checkerInput, checkerSignature, GENERATOR_SIGNATURE, generatorInput } from '../../judge/special-programs.js'
import { parseJsonPreservingIntegers, serializeInput } from '../generation/canonical-json.js'
import { MAX_CASE_BYTES } from '../generation/limits.js'
import { compactOrdinals } from '../generation/ordinals.js'
import { normalizeInput } from '../generation/signature.js'
import { Testset } from '../entities/testset.entity.js'
import { TestCase } from '../entities/test-case.entity.js'
import { TESTSET_BUILD_QUEUE, type TestsetBuildJob } from '../testsets.constants.js'

// La solución oficial corre con un límite holgado: lo que se compara con el TL es su tiempo real
const REF_TIME_FACTOR = 10
const MAX_REF_TIME_LIMIT_MS = 60_000
const MAX_LOG = 16 * 1024
// Límites holgados para los programas del juez (generador y checker)
const TOOL_TIME_LIMIT_MS = 10_000
const TOOL_MEMORY_MB = 1024

export type BuildOutcome = 'ready' | 'failed' | 'skipped'

// Ejecuta la solución oficial contra cada entrada, guarda las salidas esperadas y deja el
// testset READY (y como versión actual del problema) o FAILED con el motivo en build_log
@Processor(TESTSET_BUILD_QUEUE)
export class TestsetBuildProcessor extends WorkerHost implements OnApplicationBootstrap {
    private readonly logger = new Logger(TestsetBuildProcessor.name)

    constructor(
        @InjectRepository(Testset)
        private readonly testsetRepository: Repository<Testset>,
        @InjectRepository(TestCase)
        private readonly testCaseRepository: Repository<TestCase>,
        private readonly dataSource: DataSource,
        private readonly blobsService: BlobsService,
        private readonly judgeService: JudgeService,
        private readonly submissionQueue: SubmissionQueueService,
    ) {
        super()
    }

    // Tantos trabajos activos como núcleos; el pool hace que esperen su turno
    onApplicationBootstrap(): void {
        this.worker.concurrency = this.judgeService.concurrency
    }

    async process(job: Job<TestsetBuildJob>): Promise<BuildOutcome> {
        const testset = await this.testsetRepository.findOne({
            where: { id: job.data.testsetId },
            relations: { problem: true, ref_solution: { language: true }, checker: { language: true }, generator: { language: true } },
        })
        // Idempotente: un reintento o un trabajo viejo no toca un testset que ya cambió de estado
        if(!testset || testset.status !== TestsetStatus.BUILDING) return 'skipped'

        try {
            const errors = await this.build(testset)
            if(errors.length === 0) return 'ready'
            await this.markFailed(testset, errors.join('\n'))
        } catch(error) {
            this.logger.error('build of testset #' + testset.id + ' failed', error instanceof Error ? error.stack : undefined)
            await this.markFailed(testset, 'system error while building; try again.\n' + String(error))
        }
        return 'failed'
    }

    // Regresa los motivos por los que no quedó READY (vacío si quedó READY)
    private async build(testset: Testset): Promise<string[]> {
        const { problem, ref_solution: refSolution } = testset
        if(!problem.signature) return ['problem has no signature']
        if(!refSolution) return ['testset v' + testset.version + ' has no reference solution']

        const language = refSolution.language
        if(!hasDriver(language.code)) return ['the reference solution language (' + language.code + ') has no driver']
        if(testset.compare_mode === CompareMode.CHECKER && !testset.checker) return ['compareMode is checker but there is no checker']

        if(testset.generator){
            const generatorErrors = await this.runGenerator(testset, problem.signature)
            if(generatorErrors.length > 0) return generatorErrors
        }

        const cases = await this.testCaseRepository.find({ where: { testset_id: testset.id }, order: { ordinal: 'ASC' }})
        if(cases.length === 0) return ['testset v' + testset.version + ' has no test cases']

        const inputs = await this.blobsService.getManyText(cases.map((testCase) => testCase.input_sha))
        const missing = cases.filter((testCase) => !inputs.has(testCase.input_sha))
        if(missing.length > 0) return ['missing input for case(s) ' + missing.map((testCase) => '#' + testCase.ordinal).join(', ')]

        const timeLimitMs = Math.round(testset.time_limit_ms * language.time_multiplier)
        const result = await this.judgeService.judge({
            language,
            signature: problem.signature,
            source: refSolution.source.toString('utf8'),
            cases: cases.map((testCase) => ({ ordinal: testCase.ordinal, input: inputs.get(testCase.input_sha)!, expected: null })),
            timeLimitMs: Math.min(timeLimitMs * REF_TIME_FACTOR, MAX_REF_TIME_LIMIT_MS),
            memoryLimitMb: testset.memory_limit_mb,
            // Todavía no hay salidas esperadas: no se compara nada
            compareMode: CompareMode.EXACT,
            floatTolerance: null,
        })

        const errors = this.findErrors(result, timeLimitMs, language.time_multiplier, testset.time_limit_ms)
        if(errors.length > 0) return errors

        if(testset.compare_mode === CompareMode.CHECKER){
            const checkerErrors = await this.validateChecker(testset, problem.signature, cases.map((testCase, index) => ({
                ordinal: testCase.ordinal,
                input: inputs.get(testCase.input_sha)!,
                output: result.cases[index].output!,
            })))
            if(checkerErrors.length > 0) return checkerErrors
        }

        const saved = await this.dataSource.transaction(async (manager) => {
            // Condicional: si alguien lo cambió mientras corría (no debería), no se pisa
            const claimed = await manager.update(Testset, { id: testset.id, status: TestsetStatus.BUILDING }, {
                status: TestsetStatus.READY,
                ref_max_time_ms: result.maxTimeMs,
                build_log: this.summary(result, timeLimitMs),
            })
            if(!claimed.affected) return false

            for(const [index, testCase] of cases.entries()){
                const output = await this.blobsService.put(result.cases[index].output!, manager)
                await manager.update(TestCase, testCase.id, {
                    output_sha: output.sha,
                    output_bytes: output.size,
                    ref_time_ms: result.cases[index].cpuMs,
                })
            }

            // Desde aquí los envíos nuevos usan esta versión
            await manager.update(Problem, problem.id, { current_testset_id: testset.id })
            return true
        })

        if(!saved) return []
        this.logger.log('testset #' + testset.id + ' (problem #' + problem.id + ' v' + testset.version + ') is ready')

        // Una versión nueva de un problema publicado cambia lo que es correcto: los envíos que ya
        // tiene se re-juzgan con ella (la v1 se construye antes de publicar y no tiene envíos)
        if(problem.status === ProblemStatus.PUBLISHED && problem.current_testset_id !== testset.id){
            await this.submissionQueue.rejudge(
                { problemId: problem.id },
                { reason: 'testset v' + testset.version + ' built' + (testset.reason ? ': ' + testset.reason : ''), staffUserId: null },
            )
        }
        return []
    }

    // Reemplaza los casos del generador: un caso por semilla de cada grupo
    private async runGenerator(testset: Testset, signature: IProblemSignature): Promise<string[]> {
        const generator = testset.generator!
        const items = (testset.generator_groups ?? []).flatMap((group) =>
            group.seeds.map((seed, index) => ({ group: group.name, seed, index })))
        if(items.length === 0) return ['the generator has no groups or seeds']

        const result = await this.judgeService.judge({
            language: generator.language,
            signature: GENERATOR_SIGNATURE,
            source: generator.source.toString('utf8'),
            cases: items.map((item, index) => ({ ordinal: index + 1, input: generatorInput(item.seed, item.group, item.index), expected: null })),
            timeLimitMs: TOOL_TIME_LIMIT_MS,
            memoryLimitMb: TOOL_MEMORY_MB,
            compareMode: CompareMode.EXACT,
            floatTolerance: null,
        })
        if(result.verdict === Verdict.CE) return ['the generator does not compile:\n' + (result.compileLog ?? '')]
        const failed = result.cases.find((testCase) => testCase.verdict !== Verdict.AC)
        if(failed){
            const item = items[failed.ordinal - 1]
            return ['the generator got ' + failed.verdict + ' on ' + item.group + '/' + item.seed + (failed.message ? ':\n' + failed.message.slice(0, MAX_LOG) : '')]
        }

        // Regresa un string con el JSON del input: se valida contra la firma y se reescribe canónico
        const texts: string[] = []
        const errors: string[] = []
        for(const [index, item] of items.entries()){
            const label = item.group + '/' + item.seed
            let parsed: unknown
            try {
                parsed = parseJsonPreservingIntegers(JSON.parse(result.cases[index].output!) as string)
            } catch {
                errors.push(label + ': the generator did not return valid JSON')
                continue
            }
            const normalized = normalizeInput(signature, parsed)
            if(normalized.errors.length > 0){
                errors.push(label + ': ' + normalized.errors.slice(0, 3).join('; '))
                continue
            }
            const text = serializeInput(signature, normalized.value)
            if(Buffer.byteLength(text) > MAX_CASE_BYTES) errors.push(label + ': the input is larger than ' + MAX_CASE_BYTES + ' bytes')
            texts.push(text)
        }
        if(errors.length > 0) return errors.slice(0, 10)

        await this.dataSource.transaction(async (manager) => {
            await manager.delete(TestCase, { testset_id: testset.id, origin: TestCaseOrigin.GENERATOR })
            let ordinal = await compactOrdinals(testset.id, manager)
            for(const [index, item] of items.entries()){
                const blob = await this.blobsService.put(texts[index], manager)
                await manager.insert(TestCase, {
                    testset_id: testset.id,
                    ordinal: ++ordinal,
                    visibility: TestCaseVisibility.HIDDEN,
                    origin: TestCaseOrigin.GENERATOR,
                    input_sha: blob.sha,
                    input_bytes: blob.size,
                    group_name: item.group,
                    seed: item.seed,
                })
            }
        })
        return []
    }

    // El checker debe aceptar la salida de la solución oficial en todos los casos
    private async validateChecker(testset: Testset, signature: IProblemSignature, cases: { ordinal: number, input: string, output: string }[]): Promise<string[]> {
        const checker = testset.checker!
        const result = await this.judgeService.judge({
            language: checker.language,
            signature: checkerSignature(signature),
            source: checker.source.toString('utf8'),
            cases: cases.map((testCase) => ({ ordinal: testCase.ordinal, input: checkerInput(testCase.input, testCase.output, testCase.output), expected: null })),
            timeLimitMs: TOOL_TIME_LIMIT_MS,
            memoryLimitMb: TOOL_MEMORY_MB,
            compareMode: CompareMode.EXACT,
            floatTolerance: null,
        })
        if(result.verdict === Verdict.CE) return ['the checker does not compile:\n' + (result.compileLog ?? '')]
        const failed = result.cases.find((testCase) => testCase.verdict !== Verdict.AC)
        if(failed) return ['the checker got ' + failed.verdict + ' on case #' + failed.ordinal + (failed.message ? ':\n' + failed.message.slice(0, MAX_LOG) : '')]
        const rejected = result.cases.filter((testCase) => testCase.output !== 'true')
        if(rejected.length > 0){
            return ['the checker rejects the reference output on case(s) ' + rejected.slice(0, 10).map((testCase) => '#' + testCase.ordinal).join(', ')]
        }
        return []
    }

    private findErrors(result: JudgeResult, timeLimitMs: number, multiplier: number, baseLimitMs: number): string[] {
        if(result.verdict === Verdict.CE){
            return ['the reference solution does not compile:\n' + (result.compileLog ?? '')]
        }

        const failed = result.cases.find((testCase) => testCase.verdict !== Verdict.AC)
        if(failed){
            return [
                'the reference solution got ' + failed.verdict + ' on case #' + failed.ordinal
                + (failed.message ? ':\n' + failed.message.slice(0, MAX_LOG) : ''),
            ]
        }

        const slow = result.cases.filter((testCase) => testCase.cpuMs > timeLimitMs)
        if(slow.length > 0){
            return slow.slice(0, 5).map((testCase) =>
                'case #' + testCase.ordinal + ': the reference solution took ' + testCase.cpuMs + ' ms, over the time limit of '
                + timeLimitMs + ' ms (' + baseLimitMs + ' ms × ' + multiplier + ')',
            )
        }
        return []
    }

    private summary(result: JudgeResult, timeLimitMs: number): string {
        return 'built ' + result.cases.length + ' cases; slowest ' + result.maxTimeMs + ' ms of ' + timeLimitMs
            + ' ms, peak memory ' + Math.round(result.maxMemoryKb / 1024) + ' MB'
    }

    private async markFailed(testset: Testset, log: string): Promise<void> {
        await this.testsetRepository.update(
            { id: testset.id, status: TestsetStatus.BUILDING },
            { status: TestsetStatus.FAILED, build_log: log.slice(0, MAX_LOG) },
        )
    }
}
