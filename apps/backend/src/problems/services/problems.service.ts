import {
    ProblemStatus,
    TestCaseVisibility,
    TestsetStatus,
    type ICreateProblemResponse,
    type IProblem,
    type IProblemDetail,
    type IProblemListItem,
    type IProblemPreview,
    type IProblemSource,
    type IProblemTestset,
    type IPublishProblemResponse,
} from '@concurso/shared-types';
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { EditionsService } from '../../editions/services/editions.service.js';
import { CategoriesService } from '../../editions/services/categories.service.js';
import { EditionStaffService } from '../../editions/services/edition-staff.service.js';
import { Testset } from '../../testsets/entities/testset.entity.js';
import { TestCase } from '../../testsets/entities/test-case.entity.js';
import type { RefSolution } from '../../testsets/entities/ref-solution.entity.js';
import type { Generator } from '../../testsets/entities/generator.entity.js';
import { CreateProblemDto } from '../dto/create-problem.dto.js';
import { ProblemFiltersDto } from '../dto/problem-filters.dto.js';
import { UpdateProblemDto } from '../dto/update-problem.dto.js';
import { Problem } from '../entities/problem.entity.js';

@Injectable()
export class ProblemsService {

    constructor(
        @InjectRepository(Problem)
        private readonly problemRepository: Repository<Problem>,
        @InjectRepository(Testset)
        private readonly testsetRepository: Repository<Testset>,
        @InjectRepository(TestCase)
        private readonly testCaseRepository: Repository<TestCase>,
        private readonly dataSource: DataSource,
        private readonly editionsService: EditionsService,
        private readonly categoriesService: CategoriesService,
        private readonly editionStaffService: EditionStaffService,
    ) {}

    getRepository(): Repository<Problem> {
        return this.problemRepository;
    }

    async getById(id: number): Promise<Problem> {
        const problem = await this.problemRepository.findOne({ where: { id }})

        if(!problem){
            throw new NotFoundException('problem not found #' + id)
        }

        return problem
    }

    // Carga el problema y valida que el usuario sea juez de su edición
    private async getByIdForJudge(id: number, staffUserId: number): Promise<Problem> {
        const problem = await this.getById(id)
        await this.editionStaffService.assertCanJudge(staffUserId, problem.edition_id)

        return problem
    }

    async findAllByEdition(editionId: number, filters: ProblemFiltersDto, staffUserId: number): Promise<IProblemListItem[]> {
        await this.editionsService.getById(editionId)
        await this.editionStaffService.assertCanJudge(staffUserId, editionId)

        const problems = await this.problemRepository.find({
            where: {
                edition_id: editionId,
                ...(filters.categoryId && { category_id: filters.categoryId }),
            },
            relations: { current_testset: true },
            order: { category_id: 'ASC', letter: 'ASC' },
        })

        return problems.map((problem) => ({
            id: problem.id,
            letter: problem.letter,
            title: problem.title,
            categoryId: problem.category_id,
            status: problem.status,
            currentTestsetVersion: problem.current_testset?.version ?? null,
        }))
    }

    async create(editionId: number, dto: CreateProblemDto, staffUserId: number): Promise<ICreateProblemResponse> {
        const edition = await this.editionsService.getById(editionId)
        await this.editionStaffService.assertCanJudge(staffUserId, editionId)

        const category = await this.categoriesService.getByIdForEdition(dto.categoryId, editionId)
        await this.assertLetterIsFree(editionId, category.id, dto.letter)

        // El problema y su testset v1 vacío nacen juntos (RF-17)
        return this.dataSource.transaction(async (manager) => {
            const problem = await manager.save(manager.create(Problem, {
                edition_id: edition.id,
                category_id: category.id,
                letter: dto.letter,
                title: dto.title,
                statement_md: dto.statement,
                input_format: dto.inputFormat,
                output_format: dto.outputFormat,
                ...(dto.points !== undefined && { points: dto.points }),
            }))

            const testset = await manager.save(manager.create(Testset, {
                problem_id: problem.id,
                version: 1,
                author_id: staffUserId,
            }))

            await manager.update(Problem, problem.id, { current_testset_id: testset.id })

            return { id: problem.id, status: problem.status, testsetId: testset.id }
        })
    }

    async getDetail(id: number, staffUserId: number): Promise<IProblemDetail> {
        const problem = await this.getByIdForJudge(id, staffUserId)

        const testsets = await this.testsetRepository.find({
            where: { problem_id: id },
            relations: { ref_solution: true, generator: true },
            order: { version: 'ASC' },
        })
        const current = testsets.find((testset) => testset.id === problem.current_testset_id)

        return {
            ...this.toProblemDto(problem),
            testsets: testsets.map((testset) => this.toTestsetDto(testset)),
            refSolution: this.toSourceDto(current?.ref_solution),
            generator: this.toSourceDto(current?.generator),
        }
    }

    async update(id: number, dto: UpdateProblemDto, staffUserId: number): Promise<IProblem> {
        const problem = await this.getByIdForJudge(id, staffUserId)

        if(dto.letter !== undefined && dto.letter !== problem.letter){
            await this.assertLetterIsFree(problem.edition_id, problem.category_id, dto.letter, problem.id)
            problem.letter = dto.letter
        }

        if(dto.title !== undefined) problem.title = dto.title
        if(dto.statement !== undefined) problem.statement_md = dto.statement
        if(dto.inputFormat !== undefined) problem.input_format = dto.inputFormat
        if(dto.outputFormat !== undefined) problem.output_format = dto.outputFormat

        return this.toProblemDto(await this.problemRepository.save(problem))
    }

    // El enunciado tal como lo verá el equipo (RF-27)
    async preview(id: number, staffUserId: number): Promise<IProblemPreview> {
        const problem = await this.getByIdForJudge(id, staffUserId)
        const testset = await this.findCurrentTestset(problem)

        return {
            title: problem.title,
            statement: problem.statement_md,
            inputFormat: problem.input_format,
            outputFormat: problem.output_format,
            limits: testset && {
                timeLimitMs: testset.time_limit_ms,
                memoryLimitMb: testset.memory_limit_mb,
            },
            // TODO: devolver los casos públicos cuando exista el almacén de contenido por sha (input_sha / output_sha)
            samples: [],
        }
    }

    // No ejecuta la solución de referencia: confía en que el build del testset lo dejó en `ready` (RF-21)
    async publish(id: number, staffUserId: number): Promise<IPublishProblemResponse> {
        const problem = await this.getByIdForJudge(id, staffUserId)

        if(problem.status === ProblemStatus.PUBLISHED){
            return { status: problem.status }
        }

        const errors = await this.findPublishErrors(problem)
        if(errors.length > 0){
            throw new UnprocessableEntityException({ errors })
        }

        problem.status = ProblemStatus.PUBLISHED
        await this.problemRepository.save(problem)

        return { status: problem.status }
    }

    async remove(id: number, staffUserId: number): Promise<void> {
        const problem = await this.getByIdForJudge(id, staffUserId)

        if(problem.status !== ProblemStatus.DRAFT){
            throw new ConflictException('problem #' + id + ' can only be deleted while it is a draft')
        }

        await this.problemRepository.delete([ id ])
    }

    private async findPublishErrors(problem: Problem): Promise<string[]> {
        const errors: string[] = []

        if(!problem.statement_md.trim()) errors.push('statement is empty')
        if(!problem.input_format.trim()) errors.push('inputFormat is empty')
        if(!problem.output_format.trim()) errors.push('outputFormat is empty')

        const testset = await this.findCurrentTestset(problem)
        if(!testset){
            errors.push('problem has no current testset')
            return errors
        }

        if(testset.status !== TestsetStatus.READY){
            errors.push('testset v' + testset.version + ' is not built (status: ' + testset.status + ')')
        }
        if(testset.ref_solution_id === null){
            errors.push('testset v' + testset.version + ' has no reference solution')
        }

        const cases = await this.testCaseRepository.count({ where: { testset_id: testset.id }})
        const publicCases = await this.testCaseRepository.count({
            where: { testset_id: testset.id, visibility: TestCaseVisibility.PUBLIC },
        })
        if(cases === 0){
            errors.push('testset v' + testset.version + ' has no test cases')
        } else if(publicCases === 0){
            errors.push('testset v' + testset.version + ' has no public test cases')
        }

        return errors
    }

    private async findCurrentTestset(problem: Problem): Promise<Testset | null> {
        if(problem.current_testset_id === null) return null

        return this.testsetRepository.findOne({ where: { id: problem.current_testset_id }})
    }

    // La letra identifica al problema dentro de su categoría
    private async assertLetterIsFree(editionId: number, categoryId: number, letter: string, exceptId?: number): Promise<void> {
        const taken = await this.problemRepository.existsBy({
            edition_id: editionId,
            category_id: categoryId,
            letter,
            ...(exceptId !== undefined && { id: Not(exceptId) }),
        })

        if(taken){
            throw new ConflictException('letter ' + letter + ' is already used in category #' + categoryId)
        }
    }

    private toProblemDto(problem: Problem): IProblem {
        return {
            id: problem.id,
            editionId: problem.edition_id,
            categoryId: problem.category_id,
            letter: problem.letter,
            title: problem.title,
            statement: problem.statement_md,
            inputFormat: problem.input_format,
            outputFormat: problem.output_format,
            points: problem.points,
            status: problem.status,
            currentTestsetId: problem.current_testset_id,
        }
    }

    private toTestsetDto(testset: Testset): IProblemTestset {
        return {
            id: testset.id,
            version: testset.version,
            status: testset.status,
            timeLimitMs: testset.time_limit_ms,
            memoryLimitMb: testset.memory_limit_mb,
            refSolutionId: testset.ref_solution_id,
            generatorId: testset.generator_id,
            seed: testset.seed,
            generatedCount: testset.generated_count,
            refMaxTimeMs: testset.ref_max_time_ms,
            buildLog: testset.build_log,
            authorId: testset.author_id,
            reason: testset.reason,
            createdAt: testset.created_at,
        }
    }

    private toSourceDto(source: RefSolution | Generator | null | undefined): IProblemSource | null {
        if(!source) return null

        return {
            id: source.id,
            languageId: source.language_id,
            source: source.source.toString('utf8'),
            sourceSha: source.source_sha,
            createdBy: source.created_by,
            createdAt: source.created_at,
        }
    }
}
