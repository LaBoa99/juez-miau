import {
    CompareMode,
    ProblemStatus,
    TestCaseOrigin,
    TestCaseVisibility,
    TestsetStatus,
    type IGenerateTestsetResponse,
    type IProblem,
    type IProblemSignature,
    type IProblemSource,
    type IProblemTestset,
    type ITestCase,
    type ITestCaseContent,
    type ITestsetDetail,
    type ITestsetSummary,
} from '@concurso/shared-types';
import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { BlobsService } from '../../blobs/services/blobs.service.js';
import { EditionStaffService } from '../../editions/services/edition-staff.service.js';
import { Edition } from '../../editions/entities/edition.entity.js';
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
import { hasDriver } from '../../judge/drivers/index.js';
import { checkerNameCollisions } from '../../judge/special-programs.js';
import { parseJsonPreservingIntegers, serializeInput } from '../generation/canonical-json.js';
import { GenerationError, generateCases } from '../generation/generate.js';
import { MAX_CASE_BYTES, MAX_GENERATED_TOTAL_BYTES, MAX_INPUT_PREVIEW_BYTES, MAX_TESTSET_CASES, MAX_VALIDATION_ERRORS } from '../generation/limits.js';
import { validateSchema } from '../generation/schema.js';
import { normalizeInput, validateSignature } from '../generation/signature.js';
import { toSourceDto, toTestCaseDto, toTestsetDto, toTestsetSummary } from '../mappers/testset.mapper.js';
import { TESTSET_BUILD_QUEUE, type TestsetBuildJob } from '../testsets.constants.js';
import { UpdateSignatureDto } from '../dto/update-signature.dto.js';
import { UpdateTestsetDto } from '../dto/update-testset.dto.js';
import { CreateTestCaseDto } from '../dto/create-test-case.dto.js';
import { UpdateTestCaseDto } from '../dto/update-test-case.dto.js';
import { SetRefSolutionDto } from '../dto/set-ref-solution.dto.js';
import { CreateTestsetVersionDto } from '../dto/create-testset-version.dto.js';

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
    ) {}

    // ─── Firma y versiones (rutas bajo /problems/:problemId) ─────

    // La firma solo cambia mientras el problema es borrador y su testset actual es editable.
    // Los casos y el esquema que ya existen deben seguir siendo válidos con la nueva firma
    async updateSignature(problemId: number, dto: UpdateSignatureDto, staffUserId: number): Promise<IProblem> {
        const problem = await this.getProblemForJudge(problemId, staffUserId)
        if(problem.status !== ProblemStatus.DRAFT){
            throw new ConflictException('the signature of problem #' + problemId + ' can only change while it is a draft')
        }

        const testset = problem.current_testset_id === null
            ? null
            : await this.testsetRepository.findOneBy({ id: problem.current_testset_id })
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
        const problem = await this.getProblemForJudge(problemId, staffUserId)
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
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
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

    // Reemplaza los casos generados por los que produce el esquema
    async generate(testsetId: number, staffUserId: number): Promise<IGenerateTestsetResponse> {
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
        this.assertEditable(testset)

        const signature = this.requireSignature(problem)
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
                        visibility: TestCaseVisibility.HIDDEN,
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
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
        this.assertEditable(testset)
        await this.assertLanguageEnabled(problem, dto.languageId)
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
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
        this.assertEditable(testset)
        await this.assertLanguageEnabled(problem, dto.languageId)
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
        const { testset } = await this.getTestsetForJudge(testsetId, staffUserId)
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
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
        this.assertEditable(testset)
        this.requireSignature(problem)
        await this.assertLanguageEnabled(problem, dto.languageId)

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
        const { testset } = await this.getTestsetForJudge(testsetId, staffUserId)
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

    private async assertLanguageEnabled(problem: Problem, languageId: string): Promise<void> {
        const enabled = await this.dataSource.getRepository(Edition)
            .createQueryBuilder('edition')
            .innerJoin('edition.languages', 'language')
            .where('edition.id = :editionId', { editionId: problem.edition_id })
            .andWhere('language.id = :languageId', { languageId })
            .andWhere('language.active = true')
            .getExists()
        if(!enabled){
            throw unprocessable(['language ' + languageId + ' is not active or not enabled in edition #' + problem.edition_id])
        }
        if(!hasDriver((await this.dataSource.getRepository(Language).findOneByOrFail({ id: languageId })).code)){
            throw unprocessable(['language ' + languageId + ' has no driver for function problems'])
        }
    }

    // Deja el testset en BUILDING y encola el build; el worker (fase 3) ejecuta la solución
    // oficial, llena las salidas y lo pasa a READY o FAILED
    async build(testsetId: number, staffUserId: number): Promise<ITestsetSummary> {
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
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
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
        this.assertEditable(testset)
        const text = this.serializeManualInput(this.requireSignature(problem), dto.input)

        return this.dataSource.transaction(async (manager) => {
            const count = await manager.countBy(TestCase, { testset_id: testset.id })
            if(count >= MAX_TESTSET_CASES){
                throw unprocessable(['testset v' + testset.version + ' already has ' + MAX_TESTSET_CASES + ' cases'])
            }

            const { max } = await manager.createQueryBuilder(TestCase, 'test_case')
                .select('MAX(test_case.ordinal)', 'max')
                .where('test_case.testset_id = :testsetId', { testsetId: testset.id })
                .getRawOne<{ max: number | null }>() ?? { max: null }

            const blob = await this.blobsService.put(text, manager)
            const testCase = await manager.save(manager.create(TestCase, {
                testset_id: testset.id,
                ordinal: (max ?? 0) + 1,
                visibility: dto.visibility ?? TestCaseVisibility.HIDDEN,
                origin: TestCaseOrigin.MANUAL,
                input_sha: blob.sha,
                input_bytes: blob.size,
                output_sha: null,
                output_bytes: null,
                group_name: null,
                seed: null,
                ref_time_ms: null,
            }))

            await this.markEdited(testset, manager)
            return toTestCaseDto(testCase, blob.size <= MAX_INPUT_PREVIEW_BYTES ? text : null)
        })
    }

    async updateCase(testsetId: number, caseId: number, dto: UpdateTestCaseDto, staffUserId: number): Promise<ITestCase> {
        const { testset, problem } = await this.getTestsetForJudge(testsetId, staffUserId)
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

            const saved = await manager.save(testCase)
            await this.markEdited(testset, manager)

            const preview = saved.input_bytes <= MAX_INPUT_PREVIEW_BYTES
                ? text ?? await this.blobsService.getText(saved.input_sha)
                : null
            return toTestCaseDto(saved, preview)
        })
    }

    async removeCase(testsetId: number, caseId: number, staffUserId: number): Promise<void> {
        const { testset } = await this.getTestsetForJudge(testsetId, staffUserId)
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
