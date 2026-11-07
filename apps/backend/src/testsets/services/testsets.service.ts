import {
    CompareMode,
    ProblemStatus,
    TestCaseOrigin,
    TestCaseVisibility,
    TestsetStatus,
    Verdict,
    type IGenerateTestsetResponse,
    type IProblem,
    type IProblemSignature,
    type IProblemSource,
    type IProblemTestset,
    type ITestCase,
    type ITestCaseContent,
    type IGeneratorTemplate,
    type ITestRun,
    type ITestsetDetail,
    type ITestsetSchema,
    type ISignatureDetection,
    type ITestsetSummary,
} from '@concurso/shared-types';
import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { BlobsService } from '../../blobs/services/blobs.service.js';
import { EditionStaffService } from '../../editions/services/edition-staff.service.js';
import { Problem } from '../../problems/entities/problem.entity.js';
import { toProblemDto } from '../../problems/mappers/problem.mapper.js';
import { Testset } from '../entities/testset.entity.js';
import { TestCase } from '../entities/test-case.entity.js';
import { RefSolution } from '../entities/ref-solution.entity.js';
import { Checker } from '../entities/checker.entity.js';
import { Generator } from '../entities/generator.entity.js';
import { compactOrdinals } from '../generation/ordinals.js';
import { SetCheckerDto, SetGeneratorDto } from '../dto/set-generator.dto.js';
import { Language } from '../../languages/entities/language.entity.js';
import { generatorTemplate, hasDriver } from '../../judge/drivers/index.js';
import { checkerNameCollisions } from '../../judge/special-programs.js';
import { parseJsonPreservingIntegers, serializeInput } from '../generation/canonical-json.js';
import { GenerationError, generateCases } from '../generation/generate.js';
import { MAX_CASE_BYTES, MAX_GENERATED_TOTAL_BYTES, MAX_INPUT_PREVIEW_BYTES, MAX_TESTSET_CASES, MAX_VALIDATION_ERRORS } from '../generation/limits.js';
import { validateSchema } from '../generation/schema.js';
import { normalizeInput, validateSignature } from '../generation/signature.js';
import { toSourceDto, toTestCaseDto, toTestsetDto, toTestsetSummary } from '../mappers/testset.mapper.js';
import { SIGNATURE_QUEUE, TEST_RUN_KEEP_SECONDS, TEST_RUN_QUEUE, TESTSET_BUILD_QUEUE, type SignatureJob, type TestRunJob, type TestRunResult, type TestsetBuildJob } from '../testsets.constants.js';
import type { SignatureResult } from '../processors/signature.processor.js';
import { DetectSignatureDto } from '../dto/detect-signature.dto.js';
import { CreateTestRunDto } from '../dto/create-test-run.dto.js';
import { UpdateSignatureDto } from '../dto/update-signature.dto.js';
import { UpdateTestsetDto } from '../dto/update-testset.dto.js';
import { CreateTestCaseDto, CreateTestCasesDto } from '../dto/create-test-case.dto.js';
import { UpdateCasesVisibilityDto, UpdateTestCaseDto } from '../dto/update-test-case.dto.js';
import { SetRefSolutionDto } from '../dto/set-ref-solution.dto.js';
import { CreateTestsetVersionDto } from '../dto/create-testset-version.dto.js';

interface ManualCase { text: string, visibility?: TestCaseVisibility, group?: string | null }

const EDITABLE_STATUSES = [TestsetStatus.DRAFT, TestsetStatus.FAILED]
const DEFAULT_FLOAT_TOLERANCE = 1e-6

// Errores de validación de contenido: 422 con la lista, igual que publicar un problema
function unprocessable(errors: string[]): UnprocessableEntityException {
    return new UnprocessableEntityException({ errors: errors.slice(0, MAX_VALIDATION_ERRORS) })
}

// Casos, límites, esquema y solución oficial de un testset (RF-17 a RF-21).
// Solo un testset DRAFT (o FAILED, que vuelve a DRAFT) se puede editar; uno READY es inmutable
// y para cambiarlo se crea la siguiente versión
@Injectable()
export class TestsetsService {

    private readonly logger = new Logger(TestsetsService.name)

    constructor(
        @InjectRepository(Testset)
        private readonly testsetRepository: Repository<Testset>,
        @InjectRepository(TestCase)
        private readonly testCaseRepository: Repository<TestCase>,
        @InjectRepository(Problem)
        private readonly problemRepository: Repository<Problem>,
        @InjectRepository(RefSolution)
        private readonly refSolutionRepository: Repository<RefSolution>,
        private readonly dataSource: DataSource,
        private readonly blobsService: BlobsService,
        private readonly editionStaffService: EditionStaffService,
        @InjectQueue(TESTSET_BUILD_QUEUE)
        private readonly buildQueue: Queue<TestsetBuildJob>,
        @InjectQueue(TEST_RUN_QUEUE)
        private readonly testRunQueue: Queue<TestRunJob, TestRunResult>,
        @InjectQueue(SIGNATURE_QUEUE)
        private readonly signatureQueue: Queue<SignatureJob, SignatureResult>,
    ) {}

    // ─── Firma y versiones (rutas bajo /problems/:problemId) ─────

    // La firma solo cambia mientras el problema es borrador y la versión que se edita es editable.
    // Esa versión es la última si no está construida (una v2 en borrador sobre la v1 vigente) o la
    // vigente. Sus casos y su esquema deben seguir siendo válidos con la nueva firma
    async updateSignature(problemId: number, dto: UpdateSignatureDto, staffUserId: number): Promise<IProblem> {
        const problem = await this.getProblemForAuthor(problemId, staffUserId)
        if(problem.status !== ProblemStatus.DRAFT){
            throw new ConflictException('the signature of problem #' + problemId + ' can only change while it is a draft')
        }

        const latest = await this.testsetRepository.findOne({ where: { problem_id: problem.id }, order: { version: 'DESC' } })
        const testset = latest && latest.status !== TestsetStatus.READY
            ? latest
            : problem.current_testset_id === null ? null : await this.testsetRepository.findOneBy({ id: problem.current_testset_id })
        if(testset) this.assertEditable(testset)

        const signatureErrors = validateSignature(dto)
        if(signatureErrors.length > 0) throw unprocessable(signatureErrors)

        const signature: IProblemSignature = { functionName: dto.functionName, params: dto.params, returns: dto.returns }

        if(testset){
            const errors = await this.findIncompatibilities(testset, signature)
            if(errors.length > 0) throw unprocessable(errors)
        }

        await this.dataSource.transaction(async (manager) => {
            await manager.update(Problem, problem.id, { signature })
            if(testset) await this.markEdited(testset, manager)
        })
        problem.signature = signature

        return toProblemDto(problem)
    }

    // Clona el testset actual (READY) en la versión siguiente, en DRAFT. Los casos comparten
    // contenido por sha. El problema sigue usando la versión actual hasta que la nueva quede READY
    async createVersion(problemId: number, dto: CreateTestsetVersionDto, staffUserId: number): Promise<ITestsetSummary> {
        const problem = await this.getProblemForAuthor(problemId, staffUserId)
        const testsets = await this.testsetRepository.find({ where: { problem_id: problem.id }, order: { version: 'DESC' }})

        const current = testsets.find((testset) => testset.id === problem.current_testset_id)
        if(!current || current.status !== TestsetStatus.READY){
            throw new ConflictException('a new version can only be created from a ready testset; edit the current one instead')
        }
        const inProgress = testsets.find((testset) => testset.status !== TestsetStatus.READY)
        if(inProgress){
            throw new ConflictException('testset v' + inProgress.version + ' is still ' + inProgress.status + '; finish or build it first')
        }

        return this.dataSource.transaction(async (manager) => {
            const next = await manager.save(manager.create(Testset, {
                problem_id: problem.id,
                version: testsets[0].version + 1,
                status: TestsetStatus.DRAFT,
                ref_solution_id: current.ref_solution_id,
                generator_id: current.generator_id,
                generator_groups: current.generator_groups,
                checker_id: current.checker_id,
                seed: current.seed,
                generated_count: current.generated_count,
                time_limit_ms: current.time_limit_ms,
                memory_limit_mb: current.memory_limit_mb,
                schema: current.schema,
                compare_mode: current.compare_mode,
                float_tolerance: current.float_tolerance,
                manual_review: current.manual_review,
                review_instructions: current.review_instructions,
                author_id: staffUserId,
                reason: dto.reason,
            }))

            // Las salidas se conservan: si la nueva versión no cambia casos ni solución, el build
            // las vuelve a calcular igual
            await manager.query(
                `INSERT INTO test_case (testset_id, ordinal, visibility, origin, input_sha, output_sha, input_bytes, output_bytes, ref_time_ms, group_name, seed)
                 SELECT $1, ordinal, visibility, origin, input_sha, output_sha, input_bytes, output_bytes, ref_time_ms, group_name, seed
                 FROM test_case WHERE testset_id = $2`,
                [next.id, current.id],
            )

            return toTestsetSummary(next)
        })
    }

    // ─── Testset ─────────────────────────────────────────────────

    async getDetail(testsetId: number, staffUserId: number): Promise<ITestsetDetail> {
        const { testset } = await this.getTestsetForJudge(testsetId, staffUserId)

        const cases = await this.testCaseRepository.find({ where: { testset_id: testset.id }, order: { ordinal: 'ASC' }})
        const previews = await this.blobsService.getManyText(
            cases.filter((testCase) => testCase.input_bytes <= MAX_INPUT_PREVIEW_BYTES).map((testCase) => testCase.input_sha),
        )

        return {
            ...toTestsetDto(testset),
            problemId: testset.problem_id,
            cases: cases.map((testCase) => toTestCaseDto(
                testCase,
                testCase.input_bytes <= MAX_INPUT_PREVIEW_BYTES ? previews.get(testCase.input_sha) ?? null : null,
            )),
        }
    }

    async update(testsetId: number, dto: UpdateTestsetDto, staffUserId: number): Promise<IProblemTestset> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)

        if(dto.timeLimitMs !== undefined) testset.time_limit_ms = dto.timeLimitMs
        if(dto.memoryLimitMb !== undefined) testset.memory_limit_mb = dto.memoryLimitMb
        if(dto.compareMode !== undefined) testset.compare_mode = dto.compareMode
        if(dto.floatTolerance !== undefined) testset.float_tolerance = dto.floatTolerance
        if(dto.manualReview !== undefined) testset.manual_review = dto.manualReview
        if(dto.reviewInstructions !== undefined) testset.review_instructions = dto.reviewInstructions
        if(testset.compare_mode === CompareMode.TOLERANCE && testset.float_tolerance === null){
            testset.float_tolerance = DEFAULT_FLOAT_TOLERANCE
        }

        const schemaChanged = dto.schema !== undefined
        if(dto.schema !== undefined && dto.schema !== null){
            const signature = this.requireSignature(problem)
            const errors = validateSchema(signature, dto.schema)
            if(errors.length > 0) throw unprocessable(errors)
        }

        return this.dataSource.transaction(async (manager) => {
            if(schemaChanged){
                testset.schema = dto.schema ?? null
                // Los casos generados ya no corresponden al esquema; se regeneran con /generate
                await manager.delete(TestCase, { testset_id: testset.id, origin: TestCaseOrigin.GENERATED })
                testset.generated_count = null
            }

            this.applyEdited(testset)
            return toTestsetDto(await manager.save(testset))
        })
    }

    // Reemplaza los casos generados por los que produce el esquema. Con `schema` también lo guarda,
    // en la misma transacción, para no perder la visibilidad que el juez ya eligió
    async generate(testsetId: number, staffUserId: number, newSchema?: ITestsetSchema): Promise<IGenerateTestsetResponse> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)

        const signature = this.requireSignature(problem)
        if(newSchema) testset.schema = newSchema
        if(!testset.schema){
            throw unprocessable(['testset v' + testset.version + ' has no schema'])
        }
        const schemaErrors = validateSchema(signature, testset.schema)
        if(schemaErrors.length > 0) throw unprocessable(schemaErrors)

        const manualCount = await this.testCaseRepository.countBy({ testset_id: testset.id, origin: TestCaseOrigin.MANUAL })
        const seedCount = testset.schema.groups.reduce((total, group) => total + group.seeds.length, 0)
        if(manualCount + seedCount > MAX_TESTSET_CASES){
            throw unprocessable(['' + manualCount + ' manual cases + ' + seedCount + ' generated exceed the limit of ' + MAX_TESTSET_CASES])
        }

        const schema = testset.schema
        try {
            return await this.dataSource.transaction(async (manager) => {
                // Misma semilla del mismo grupo = mismo caso para el juez: conserva si era público
                const previous = await manager.find(TestCase, {
                    where: { testset_id: testset.id, origin: TestCaseOrigin.GENERATED },
                    select: { group_name: true, seed: true, visibility: true },
                })
                const visibilityOf = new Map(previous.map((testCase) => [testCase.group_name + '\u0000' + testCase.seed, testCase.visibility]))

                await manager.delete(TestCase, { testset_id: testset.id, origin: TestCaseOrigin.GENERATED })
                let ordinal = await compactOrdinals(testset.id, manager)
                let totalBytes = 0
                let generatedCount = 0

                for(const generated of generateCases(signature, schema)){
                    totalBytes += Buffer.byteLength(generated.text)
                    if(totalBytes > MAX_GENERATED_TOTAL_BYTES){
                        throw new GenerationError('generated cases exceed ' + MAX_GENERATED_TOTAL_BYTES + ' bytes in total')
                    }

                    const blob = await this.blobsService.put(generated.text, manager)
                    await manager.insert(TestCase, {
                        testset_id: testset.id,
                        ordinal: ++ordinal,
                        visibility: visibilityOf.get(generated.group + '\u0000' + generated.seed) ?? TestCaseVisibility.HIDDEN,
                        origin: TestCaseOrigin.GENERATED,
                        input_sha: blob.sha,
                        input_bytes: blob.size,
                        group_name: generated.group,
                        seed: generated.seed,
                    })
                    generatedCount++
                }

                testset.generated_count = generatedCount
                this.applyEdited(testset)
                await manager.save(testset)

                return { generatedCount }
            })
        } catch(error) {
            if(error instanceof GenerationError) throw unprocessable([error.message])
            throw error
        }
    }

    async setRefSolution(testsetId: number, dto: SetRefSolutionDto, staffUserId: number): Promise<IProblemSource> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        await this.assertLanguageUsable(dto.languageId)
        const source = Buffer.from(dto.source, 'utf8')

        return this.dataSource.transaction(async (manager) => {
            const refSolution = await manager.save(manager.create(RefSolution, {
                problem_id: problem.id,
                language_id: dto.languageId,
                source,
                source_sha: BlobsService.sha256(source),
                created_by: staffUserId,
            }))

            testset.ref_solution_id = refSolution.id
            this.applyEdited(testset)
            await manager.save(testset)

            return toSourceDto(refSolution)!
        })
    }

    // compare_mode = checker lo exige; el build revisa que acepte las salidas de la solución oficial
    async setChecker(testsetId: number, dto: SetCheckerDto, staffUserId: number): Promise<IProblemSource> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        await this.assertLanguageUsable(dto.languageId)
        const collisions = checkerNameCollisions(this.requireSignature(problem))
        if(collisions.length > 0) throw unprocessable(collisions)
        const source = Buffer.from(dto.source, 'utf8')

        return this.dataSource.transaction(async (manager) => {
            const checker = await manager.save(manager.create(Checker, {
                problem_id: problem.id,
                language_id: dto.languageId,
                source,
                source_sha: BlobsService.sha256(source),
                created_by: staffUserId,
            }))

            testset.checker_id = checker.id
            this.applyEdited(testset)
            await manager.save(testset)

            return toSourceDto(checker)!
        })
    }

    async removeChecker(testsetId: number, staffUserId: number): Promise<void> {
        const { testset } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        if(testset.compare_mode === CompareMode.CHECKER){
            throw unprocessable(['change compareMode before removing the checker'])
        }
        testset.checker_id = null
        this.applyEdited(testset)
        await this.testsetRepository.save(testset)
    }

    // Los casos del generador se crean (y reemplazan) al construir el testset: necesita Docker
    async setGenerator(testsetId: number, dto: SetGeneratorDto, staffUserId: number): Promise<IProblemSource> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        this.requireSignature(problem)
        await this.assertLanguageUsable(dto.languageId)

        const names = dto.groups.map((group) => group.name)
        if(new Set(names).size !== names.length) throw unprocessable(['generator group names must be unique'])
        const seeds = dto.groups.reduce((total, group) => total + group.seeds.length, 0)
        const others = await this.testCaseRepository.count({ where: { testset_id: testset.id, origin: Not(TestCaseOrigin.GENERATOR) } })
        if(others + seeds > MAX_TESTSET_CASES){
            throw unprocessable(['' + others + ' cases + ' + seeds + ' from the generator exceed the limit of ' + MAX_TESTSET_CASES])
        }
        const source = Buffer.from(dto.source, 'utf8')

        return this.dataSource.transaction(async (manager) => {
            const generator = await manager.save(manager.create(Generator, {
                problem_id: problem.id,
                language_id: dto.languageId,
                source,
                source_sha: BlobsService.sha256(source),
                created_by: staffUserId,
            }))

            testset.generator_id = generator.id
            testset.generator_groups = dto.groups.map((group) => ({ name: group.name, seeds: group.seeds }))
            this.applyEdited(testset)
            await manager.save(testset)

            return toSourceDto(generator)!
        })
    }

    async removeGenerator(testsetId: number, staffUserId: number): Promise<void> {
        const { testset } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)

        await this.dataSource.transaction(async (manager) => {
            await manager.delete(TestCase, { testset_id: testset.id, origin: TestCaseOrigin.GENERATOR })
            await compactOrdinals(testset.id, manager)
            testset.generator_id = null
            testset.generator_groups = null
            this.applyEdited(testset)
            await manager.save(testset)
        })
    }

    // Programas del staff (solución oficial, checker, generador, pruebas): cualquier lenguaje activo
    // con driver, sin importar cuáles se habilitaron para los concursantes de la edición
    private async assertLanguageUsable(languageId: string): Promise<void> {
        const language = await this.dataSource.getRepository(Language).findOneBy({ id: languageId, active: true })
        if(!language) throw unprocessable(['language ' + languageId + ' is not active'])
        if(!hasDriver(language.code)){
            throw unprocessable(['language ' + languageId + ' has no driver for function problems'])
        }
    }

    // Deja el testset en BUILDING y encola el build; el worker (fase 3) ejecuta la solución
    // oficial, llena las salidas y lo pasa a READY o FAILED
    async build(testsetId: number, staffUserId: number): Promise<ITestsetSummary> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)

        const errors: string[] = []
        if(!problem.signature) errors.push('problem has no signature')
        if(testset.ref_solution_id === null) errors.push('testset v' + testset.version + ' has no reference solution')
        if(testset.compare_mode === CompareMode.CHECKER && testset.checker_id === null){
            errors.push('compareMode is checker but testset v' + testset.version + ' has no checker')
        }

        // Los casos del generador todavía no existen: se crean al construir
        const cases = (await this.testCaseRepository.countBy({ testset_id: testset.id })) + (testset.generator_id === null ? 0 : 1)
        const publicCases = await this.testCaseRepository.countBy({ testset_id: testset.id, visibility: TestCaseVisibility.PUBLIC })
        if(cases === 0){
            errors.push('testset v' + testset.version + ' has no test cases')
        } else if(publicCases === 0){
            errors.push('testset v' + testset.version + ' has no public test cases')
        }
        if(errors.length > 0) throw unprocessable(errors)

        // Condicional para que dos peticiones simultáneas no encolen dos builds
        const result = await this.testsetRepository.update(
            { id: testset.id, status: In(EDITABLE_STATUSES) },
            { status: TestsetStatus.BUILDING, build_log: null },
        )
        if(!result.affected){
            throw new ConflictException('testset v' + testset.version + ' is already being built')
        }

        try {
            await this.buildQueue.add('build', { testsetId: testset.id }, { removeOnComplete: 100, removeOnFail: 100 })
        } catch(error) {
            this.logger.error('could not enqueue the build of testset #' + testset.id, error instanceof Error ? error.stack : undefined)
            await this.testsetRepository.update(testset.id, { status: TestsetStatus.DRAFT })
            throw new ServiceUnavailableException('could not enqueue the build; try again')
        }

        testset.status = TestsetStatus.BUILDING
        return toTestsetSummary(testset)
    }

    async getGeneratorTemplate(problemId: number, languageId: string, staffUserId: number): Promise<IGeneratorTemplate> {
        const problem = await this.getProblemForJudge(problemId, staffUserId)
        const signature = this.requireSignature(problem)
        const language = await this.dataSource.getRepository(Language).findOneBy({ id: languageId })
        const source = language && generatorTemplate(language.code, signature)
        if(!language || !source) throw unprocessable(['language ' + languageId + ' has no template for generators'])
        return { fileName: 'generador.' + language.file_ext, source }
    }

    // ─── Pruebas del staff: una solución contra un testset construido, sin crear envío ───

    async startTestRun(testsetId: number, dto: CreateTestRunDto, staffUserId: number): Promise<ITestRun> {
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
        // Verificar corre la solución oficial sobre los casos aún sin salidas; probar necesita el testset construido
        if(!dto.verify && testset.status !== TestsetStatus.READY){
            throw unprocessable(['testset v' + testset.version + ' must be built before testing a solution'])
        }
        if(dto.verify && testset.status === TestsetStatus.BUILDING){
            throw new ConflictException('testset v' + testset.version + ' is being built')
        }

        let languageId: string
        let source: string
        if(dto.useRefSolution || dto.verify){
            const ref = testset.ref_solution_id === null ? null : await this.refSolutionRepository.findOneBy({ id: testset.ref_solution_id })
            if(!ref) throw unprocessable(['testset v' + testset.version + ' has no reference solution'])
            languageId = ref.language_id
            source = ref.source.toString('utf8')
        } else {
            if(!dto.languageId || !dto.source) throw unprocessable(['languageId and source are required'])
            await this.assertLanguageUsable(dto.languageId)
            languageId = dto.languageId
            source = dto.source
        }

        const total = await this.testCaseRepository.countBy({ testset_id: testset.id })
        if(total === 0) throw unprocessable(['testset v' + testset.version + ' has no test cases'])
        const job = await this.testRunQueue.add('run', { testsetId: testset.id, languageId, source, verify: dto.verify === true }, {
            removeOnComplete: { age: TEST_RUN_KEEP_SECONDS },
            removeOnFail: { age: TEST_RUN_KEEP_SECONDS },
        })
        return { id: job.id!, status: 'queued', judged: 0, total, verdict: null, compileLog: null, cases: [], error: null }
    }

    async getTestRun(testsetId: number, runId: string, staffUserId: number): Promise<ITestRun> {
        await this.getTestsetForJudge(testsetId, staffUserId)
        const job = await this.testRunQueue.getJob(runId)
        if(!job || job.data.testsetId !== testsetId){
            throw new NotFoundException('test run not found #' + runId)
        }

        const state = await job.getState()
        const progress = (typeof job.progress === 'object' ? job.progress : {}) as { judged?: number, total?: number }
        const total = progress.total ?? await this.testCaseRepository.countBy({ testset_id: testsetId })
        const base: ITestRun = { id: runId, status: 'queued', judged: progress.judged ?? 0, total, verdict: null, compileLog: null, cases: [], error: null }

        if(state === 'active') return { ...base, status: 'running' }
        if(state === 'failed') return { ...base, status: 'failed', error: job.failedReason ?? 'unknown error' }
        if(state === 'completed'){
            const result = job.returnvalue
            return {
                ...base,
                status: 'done',
                judged: result.cases.length,
                verdict: result.verdict as Verdict,
                compileLog: result.compileLog,
                cases: result.cases.map((c) => ({ ...c, verdict: c.verdict as Verdict })),
            }
        }
        return base
    }

    // ─── Firma desde la solución oficial ─────────────────────────

    async startSignatureDetection(testsetId: number, dto: DetectSignatureDto, staffUserId: number): Promise<ISignatureDetection> {
        const { testset } = await this.getTestsetForAuthor(testsetId, staffUserId)
        await this.assertLanguageUsable(dto.languageId)
        const job = await this.signatureQueue.add('detect', { testsetId: testset.id, languageId: dto.languageId, source: dto.source, functionName: dto.functionName }, {
            removeOnComplete: { age: TEST_RUN_KEEP_SECONDS },
            removeOnFail: { age: TEST_RUN_KEEP_SECONDS },
        })
        return { id: job.id!, status: 'queued', candidates: [], chosen: null, compiles: null, compileLog: null, error: null }
    }

    async getSignatureDetection(testsetId: number, jobId: string, staffUserId: number): Promise<ISignatureDetection> {
        await this.getTestsetForAuthor(testsetId, staffUserId)
        const job = await this.signatureQueue.getJob(jobId)
        if(!job || job.data.testsetId !== testsetId){
            throw new NotFoundException('signature detection not found #' + jobId)
        }

        const base: ISignatureDetection = { id: jobId, status: 'queued', candidates: [], chosen: null, compiles: null, compileLog: null, error: null }
        const state = await job.getState()
        if(state === 'active') return { ...base, status: 'running' }
        if(state === 'failed') return { ...base, status: 'failed', error: job.failedReason ?? 'unknown error' }
        if(state === 'completed') return { ...base, status: 'done', ...job.returnvalue }
        return base
    }

    // ─── Casos ───────────────────────────────────────────────────

    async getCase(testsetId: number, caseId: number, staffUserId: number): Promise<ITestCaseContent> {
        await this.getTestsetForJudge(testsetId, staffUserId)
        const testCase = await this.getCaseOfTestset(testsetId, caseId)

        return {
            id: testCase.id,
            input: await this.blobsService.getText(testCase.input_sha),
            output: testCase.output_sha === null ? null : await this.blobsService.getText(testCase.output_sha),
        }
    }

    async addCase(testsetId: number, dto: CreateTestCaseDto, staffUserId: number): Promise<ITestCase> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        const text = this.serializeManualInput(this.requireSignature(problem), dto.input)
        return (await this.insertManualCases(testset, [{ text, visibility: dto.visibility, group: dto.group }]))[0]
    }

    // Todos o ninguno; los errores dicen qué caso (1 = el primero) falló
    async addCases(testsetId: number, dto: CreateTestCasesDto, staffUserId: number): Promise<ITestCase[]> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        const signature = this.requireSignature(problem)

        const errors: string[] = []
        const items = dto.cases.map((testCase, index) => {
            try {
                return { text: this.serializeManualInput(signature, testCase.input), visibility: testCase.visibility, group: testCase.group }
            } catch(error) {
                const messages = error instanceof UnprocessableEntityException ? (error.getResponse() as { errors: string[] }).errors : [String(error)]
                errors.push(...messages.map((text) => 'case ' + (index + 1) + ': ' + text))
                return null
            }
        })
        if(errors.length > 0) throw unprocessable(errors)
        return this.insertManualCases(testset, items as ManualCase[])
    }

    // Un caso generado pasa a manual: se puede editar y ya no lo borra la siguiente generación
    async pinCase(testsetId: number, caseId: number, staffUserId: number): Promise<ITestCase> {
        const { testset } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        const testCase = await this.getCaseOfTestset(testsetId, caseId)
        if(testCase.origin !== TestCaseOrigin.GENERATED){
            throw new ConflictException('only cases generated from the schema can be pinned')
        }

        return this.dataSource.transaction(async (manager) => {
            testCase.origin = TestCaseOrigin.MANUAL
            testCase.group_name = null
            testCase.seed = null
            const saved = await manager.save(testCase)
            await this.markEdited(testset, manager)
            const preview = saved.input_bytes <= MAX_INPUT_PREVIEW_BYTES ? await this.blobsService.getText(saved.input_sha) : null
            return toTestCaseDto(saved, preview)
        })
    }

    private insertManualCases(testset: Testset, items: ManualCase[]): Promise<ITestCase[]> {
        return this.dataSource.transaction(async (manager) => {
            const count = await manager.countBy(TestCase, { testset_id: testset.id })
            if(count + items.length > MAX_TESTSET_CASES){
                throw unprocessable(['testset v' + testset.version + ' would have more than ' + MAX_TESTSET_CASES + ' cases'])
            }

            const { max } = await manager.createQueryBuilder(TestCase, 'test_case')
                .select('MAX(test_case.ordinal)', 'max')
                .where('test_case.testset_id = :testsetId', { testsetId: testset.id })
                .getRawOne<{ max: number | null }>() ?? { max: null }

            const created: ITestCase[] = []
            for(const [index, { text, visibility, group }] of items.entries()){
                const blob = await this.blobsService.put(text, manager)
                const testCase = await manager.save(manager.create(TestCase, {
                    testset_id: testset.id,
                    ordinal: (max ?? 0) + 1 + index,
                    visibility: visibility ?? TestCaseVisibility.HIDDEN,
                    origin: TestCaseOrigin.MANUAL,
                    input_sha: blob.sha,
                    input_bytes: blob.size,
                    output_sha: null,
                    output_bytes: null,
                    group_name: group?.trim() || null,
                    seed: null,
                    ref_time_ms: null,
                }))
                created.push(toTestCaseDto(testCase, blob.size <= MAX_INPUT_PREVIEW_BYTES ? text : null))
            }

            await this.markEdited(testset, manager)
            return created
        })
    }

    async updateCase(testsetId: number, caseId: number, dto: UpdateTestCaseDto, staffUserId: number): Promise<ITestCase> {
        const { testset, problem } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        const testCase = await this.getCaseOfTestset(testsetId, caseId)

        let text: string | null = null
        if(dto.input !== undefined){
            if(testCase.origin !== TestCaseOrigin.MANUAL){
                throw new ConflictException('generated cases cannot be edited; change the schema and generate again')
            }
            text = this.serializeManualInput(this.requireSignature(problem), dto.input)
        }

        return this.dataSource.transaction(async (manager) => {
            if(text !== null){
                const blob = await this.blobsService.put(text, manager)
                if(blob.sha !== testCase.input_sha){
                    testCase.input_sha = blob.sha
                    testCase.input_bytes = blob.size
                    // La salida anterior ya no corresponde al nuevo input
                    testCase.output_sha = null
                    testCase.output_bytes = null
                    testCase.ref_time_ms = null
                }
            }
            if(dto.visibility !== undefined) testCase.visibility = dto.visibility
            if(dto.group !== undefined){
                if(testCase.origin !== TestCaseOrigin.MANUAL) throw new ConflictException('only manual cases can change group')
                testCase.group_name = dto.group?.trim() || null
            }

            const saved = await manager.save(testCase)
            await this.markEdited(testset, manager)

            const preview = saved.input_bytes <= MAX_INPUT_PREVIEW_BYTES
                ? text ?? await this.blobsService.getText(saved.input_sha)
                : null
            return toTestCaseDto(saved, preview)
        })
    }

    // Visibilidad de todo un grupo; `group: null` son los casos manuales
    async updateCasesVisibility(testsetId: number, dto: UpdateCasesVisibilityDto, staffUserId: number): Promise<{ updated: number }> {
        const { testset } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)

        return this.dataSource.transaction(async (manager) => {
            const result = await manager.update(TestCase, { testset_id: testset.id, group_name: dto.group ?? IsNull() }, { visibility: dto.visibility })
            await this.markEdited(testset, manager)
            return { updated: result.affected ?? 0 }
        })
    }

    async removeCase(testsetId: number, caseId: number, staffUserId: number): Promise<void> {
        const { testset } = await this.getTestsetForAuthor(testsetId, staffUserId)
        this.assertEditable(testset)
        const testCase = await this.getCaseOfTestset(testsetId, caseId)

        await this.dataSource.transaction(async (manager) => {
            await manager.delete(TestCase, { id: testCase.id })
            await this.markEdited(testset, manager)
        })
    }

    // ─── Auxiliares ──────────────────────────────────────────────

    private async getProblemForJudge(problemId: number, staffUserId: number): Promise<Problem> {
        const problem = await this.problemRepository.findOneBy({ id: problemId })
        if(!problem){
            throw new NotFoundException('problem not found #' + problemId)
        }

        await this.editionStaffService.assertCanJudge(staffUserId, problem.edition_id)
        return problem
    }

    // Para escribir: el autor del problema, un admin de la edición o un superadmin
    private async getTestsetForAuthor(testsetId: number, staffUserId: number): Promise<{ testset: Testset, problem: Problem }> {
        const result = await this.getTestsetForJudge(testsetId, staffUserId)
        await this.editionStaffService.assertCanEditProblem(staffUserId, result.problem)
        return result
    }

    private async getProblemForAuthor(problemId: number, staffUserId: number): Promise<Problem> {
        const problem = await this.getProblemForJudge(problemId, staffUserId)
        await this.editionStaffService.assertCanEditProblem(staffUserId, problem)
        return problem
    }

    private async getTestsetForJudge(testsetId: number, staffUserId: number): Promise<{ testset: Testset, problem: Problem }> {
        const testset = await this.testsetRepository.findOne({ where: { id: testsetId }, relations: { problem: true }})
        if(!testset){
            throw new NotFoundException('testset not found #' + testsetId)
        }

        await this.editionStaffService.assertCanJudge(staffUserId, testset.problem.edition_id)
        const { problem } = testset
        return { testset, problem }
    }

    private async getCaseOfTestset(testsetId: number, caseId: number): Promise<TestCase> {
        const testCase = await this.testCaseRepository.findOneBy({ id: caseId, testset_id: testsetId })
        if(!testCase){
            throw new NotFoundException('test case not found #' + caseId + ' in testset #' + testsetId)
        }
        return testCase
    }

    private assertEditable(testset: Testset): void {
        if(!EDITABLE_STATUSES.includes(testset.status)){
            throw new ConflictException(
                'testset v' + testset.version + ' is ' + testset.status + ' and cannot be edited'
                + (testset.status === TestsetStatus.READY ? '; create a new version' : ''),
            )
        }
    }

    private requireSignature(problem: Problem): IProblemSignature {
        if(!problem.signature){
            throw unprocessable(['problem #' + problem.id + ' has no signature; define it first'])
        }
        return problem.signature
    }

    private serializeManualInput(signature: IProblemSignature, input: unknown): string {
        const { value, errors } = normalizeInput(signature, input)
        if(errors.length > 0) throw unprocessable(errors)

        const text = serializeInput(signature, value)
        if(Buffer.byteLength(text) > MAX_CASE_BYTES){
            throw unprocessable(['input is larger than ' + MAX_CASE_BYTES + ' bytes'])
        }
        return text
    }

    // Editar un testset FAILED lo regresa a DRAFT: el log del build anterior ya no aplica
    private applyEdited(testset: Testset): void {
        if(testset.status === TestsetStatus.FAILED){
            testset.status = TestsetStatus.DRAFT
            testset.build_log = null
        }
    }

    private async markEdited(testset: Testset, manager: EntityManager): Promise<void> {
        if(testset.status !== TestsetStatus.FAILED) return

        this.applyEdited(testset)
        await manager.update(Testset, testset.id, { status: testset.status, build_log: null })
    }

    // Renumera 1..n los casos que quedan y regresa n. Se pasa por negativos para no chocar
    // con el índice único (testset_id, ordinal) a mitad de la actualización
    // Casos y esquema que dejarían de ser válidos con otra firma
    private async findIncompatibilities(testset: Testset, signature: IProblemSignature): Promise<string[]> {
        const errors: string[] = []

        if(testset.schema){
            errors.push(...validateSchema(signature, testset.schema))
        }

        const cases = await this.testCaseRepository.find({ where: { testset_id: testset.id }, order: { ordinal: 'ASC' }})
        const inputs = await this.blobsService.getManyText(cases.map((testCase) => testCase.input_sha))

        for(const testCase of cases){
            if(errors.length >= MAX_VALIDATION_ERRORS) break
            const text = inputs.get(testCase.input_sha)
            if(text === undefined) continue

            const result = normalizeInput(signature, parseJsonPreservingIntegers(text))
            errors.push(...result.errors.map((error) => 'case #' + testCase.ordinal + ' ' + error))
        }

        return errors
    }
}
