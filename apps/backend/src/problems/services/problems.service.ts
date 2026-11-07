import {
    ProblemStatus,
    StaffRole,
    TestCaseVisibility,
    TestsetStatus,
    type ICreateProblemResponse,
    type IProblem,
    type IProblemDetail,
    type IProblemListItem,
    type IProblemPreview,
    type IProblemSample,
    type IPublishProblemResponse,
} from '@concurso/shared-types';
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { EditionsService } from '../../editions/services/editions.service.js';
import { CategoriesService } from '../../editions/services/categories.service.js';
import { EditionStaffService } from '../../editions/services/edition-staff.service.js';
import { Testset } from '../../testsets/entities/testset.entity.js';
import { TestCase } from '../../testsets/entities/test-case.entity.js';
import { BlobsService } from '../../blobs/services/blobs.service.js';
import { toSourceDto, toTestsetDto } from '../../testsets/mappers/testset.mapper.js';
import { toProblemDto } from '../mappers/problem.mapper.js';
import { CreateProblemDto } from '../dto/create-problem.dto.js';
import { ProblemFiltersDto } from '../dto/problem-filters.dto.js';
import { UpdateProblemDto } from '../dto/update-problem.dto.js';
import { Problem } from '../entities/problem.entity.js';
import { StaffUser } from '../../staff/entities/staff-user.entity.js';

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
        private readonly blobsService: BlobsService,
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
    // Para escribir: el autor, un admin de la edición o un superadmin
    private async getByIdForAuthor(id: number, staffUserId: number): Promise<Problem> {
        const problem = await this.getById(id)
        await this.editionStaffService.assertCanEditProblem(staffUserId, problem)
        return problem
    }

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
            order: { category_id: 'ASC', id: 'ASC' },
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
        this.editionsService.assertIsEditable(edition)

        // Sin letra: se asigna al iniciar el concurso, solo a los problemas aceptados
        const category = await this.categoriesService.getByIdForEdition(dto.categoryId, editionId)

        // El problema y su testset v1 vacío nacen juntos (RF-17)
        return this.dataSource.transaction(async (manager) => {
            const problem = await manager.save(manager.create(Problem, {
                edition_id: edition.id,
                category_id: category.id,
                created_by: staffUserId,
                title: dto.title,
                statement_md: dto.statement ?? '',
                input_format: dto.inputFormat ?? '',
                output_format: dto.outputFormat ?? '',
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
        const author = problem.created_by === null ? null : await this.dataSource.getRepository(StaffUser).findOneBy({ id: problem.created_by })

        return {
            ...toProblemDto(problem),
            testsets: testsets.map((testset) => toTestsetDto(testset)),
            refSolution: toSourceDto(current?.ref_solution),
            generator: toSourceDto(current?.generator),
            author: author && { id: author.id, name: author.name },
            canEdit: await this.editionStaffService.canEditProblem(staffUserId, problem),
        }
    }

    async update(id: number, dto: UpdateProblemDto, staffUserId: number): Promise<IProblem> {
        const problem = await this.getByIdForAuthor(id, staffUserId)

        if(dto.title !== undefined) problem.title = dto.title
        if(dto.statement !== undefined) problem.statement_md = dto.statement
        // Markdown y PDF son excluyentes: escribir markdown quita el PDF
        if(dto.statement?.trim()) problem.statement_pdf_sha = null
        if(dto.inputFormat !== undefined) problem.input_format = dto.inputFormat
        if(dto.outputFormat !== undefined) problem.output_format = dto.outputFormat

        return toProblemDto(await this.problemRepository.save(problem))
    }

    // ─── Enunciado en PDF (excluyente con el markdown) ───

    async setStatementPdf(id: number, pdf: Buffer, staffUserId: number): Promise<IProblem> {
        const problem = await this.getByIdForAuthor(id, staffUserId)
        // Solo la cabecera: un PDF dañado lo detecta el visor, no el servidor
        if(pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new UnprocessableEntityException({ errors: ['the file is not a PDF'] })

        return this.dataSource.transaction(async (manager) => {
            const blob = await this.blobsService.put(pdf, manager)
            problem.statement_pdf_sha = blob.sha
            problem.statement_md = ''
            return toProblemDto(await manager.save(problem))
        })
    }

    async removeStatementPdf(id: number, staffUserId: number): Promise<void> {
        const problem = await this.getByIdForAuthor(id, staffUserId)
        problem.statement_pdf_sha = null
        await this.problemRepository.save(problem)
    }

    async getStatementPdf(id: number, staffUserId: number): Promise<Buffer> {
        return this.readStatementPdf(await this.getByIdForJudge(id, staffUserId))
    }

    // Sin revisar permisos: también lo usa la vista del equipo durante el concurso
    async readStatementPdf(problem: Problem): Promise<Buffer> {
        if(problem.statement_pdf_sha === null) throw new NotFoundException('problem #' + problem.id + ' has no PDF statement')
        return this.blobsService.get(problem.statement_pdf_sha)
    }

    // El enunciado tal como lo verá el equipo (RF-27)
    async preview(id: number, staffUserId: number): Promise<IProblemPreview> {
        return this.buildPreview(await this.getByIdForJudge(id, staffUserId))
    }

    // Sin revisar permisos: también lo usa la vista del equipo durante el concurso
    async buildPreview(problem: Problem): Promise<IProblemPreview> {
        const testset = await this.findCurrentTestset(problem)

        return {
            title: problem.title,
            statement: problem.statement_md,
            hasStatementPdf: problem.statement_pdf_sha !== null,
            inputFormat: problem.input_format,
            outputFormat: problem.output_format,
            signature: problem.signature,
            limits: testset && {
                timeLimitMs: testset.time_limit_ms,
                memoryLimitMb: testset.memory_limit_mb,
            },
            samples: testset ? await this.findSamples(testset) : [],
        }
    }

    // Casos públicos que ya tienen salida (calculada por el build), en orden
    private async findSamples(testset: Testset): Promise<IProblemSample[]> {
        const cases = await this.testCaseRepository.find({
            where: { testset_id: testset.id, visibility: TestCaseVisibility.PUBLIC, output_sha: Not(IsNull()) },
            order: { ordinal: 'ASC' },
        })
        const contents = await this.blobsService.getManyText(cases.flatMap((testCase) => [testCase.input_sha, testCase.output_sha!]))

        return cases.flatMap((testCase) => {
            const input = contents.get(testCase.input_sha)
            const output = contents.get(testCase.output_sha!)
            return input !== undefined && output !== undefined ? [{ input, output }] : []
        })
    }

    // El autor (o un admin) lo propone: draft → ready. No ejecuta la solución de referencia:
    // confía en que el build del testset lo dejó en `ready` (RF-21)
    async propose(id: number, staffUserId: number): Promise<IPublishProblemResponse> {
        const problem = await this.getByIdForAuthor(id, staffUserId)
        if(problem.status !== ProblemStatus.DRAFT) return { status: problem.status }

        await this.assertPublishable(problem)
        return this.setStatus(problem, ProblemStatus.READY)
    }

    // Admin de la edición o superadmin: ready → published (entra al concurso). Un draft se propone y acepta de una vez
    async accept(id: number, staffUserId: number): Promise<IPublishProblemResponse> {
        const problem = await this.getByIdForEditionAdmin(id, staffUserId)
        if(problem.status === ProblemStatus.PUBLISHED) return { status: problem.status }

        await this.assertPublishable(problem)
        return this.setStatus(problem, ProblemStatus.PUBLISHED)
    }

    // Lo saca del concurso sin borrarlo: published → ready
    async disable(id: number, staffUserId: number): Promise<IPublishProblemResponse> {
        const problem = await this.getByIdForEditionAdmin(id, staffUserId)
        if(problem.status !== ProblemStatus.PUBLISHED) return { status: problem.status }

        return this.setStatus(problem, ProblemStatus.READY)
    }

    private async getByIdForEditionAdmin(id: number, staffUserId: number): Promise<Problem> {
        const problem = await this.getById(id)
        await this.editionStaffService.assertRole(staffUserId, problem.edition_id, [StaffRole.ADMIN])
        // Qué entra al concurso se decide antes de iniciarlo; las letras se asignan al iniciar
        this.editionsService.assertIsEditable(await this.editionsService.getById(problem.edition_id))
        return problem
    }

    private async assertPublishable(problem: Problem): Promise<void> {
        const errors = await this.findPublishErrors(problem)
        if(errors.length > 0) throw new UnprocessableEntityException({ errors })
    }

    private async setStatus(problem: Problem, status: ProblemStatus): Promise<IPublishProblemResponse> {
        problem.status = status
        await this.problemRepository.save(problem)
        return { status }
    }

    async remove(id: number, staffUserId: number): Promise<void> {
        const problem = await this.getByIdForAuthor(id, staffUserId)

        if(problem.status === ProblemStatus.PUBLISHED){
            throw new ConflictException('problem #' + id + ' is in the contest; take it out before deleting it')
        }

        await this.problemRepository.delete([ id ])
    }

    private async findPublishErrors(problem: Problem): Promise<string[]> {
        const errors: string[] = []

        if(!problem.statement_md.trim() && problem.statement_pdf_sha === null) errors.push('statement is empty')
        if(!problem.signature) errors.push('signature is not defined')

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

        const withoutOutput = await this.testCaseRepository.count({ where: { testset_id: testset.id, output_sha: IsNull() }})
        if(withoutOutput > 0){
            errors.push('testset v' + testset.version + ' has ' + withoutOutput + ' cases without expected output')
        }

        return errors
    }

    private async findCurrentTestset(problem: Problem): Promise<Testset | null> {
        if(problem.current_testset_id === null) return null

        return this.testsetRepository.findOne({ where: { id: problem.current_testset_id }})
    }

}
