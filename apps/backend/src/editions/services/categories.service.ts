import { CompareMode, TestsetStatus, type ICategory } from '@concurso/shared-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { CreateCategoryDto } from '../dto/create-category.dto.js';
import { UpdateCategoryDto } from '../dto/update-category.dto.js';
import { Category } from '../entities/category.entity.js';
import { EditionsService } from './editions.service.js';
import { Team } from '../../teams/entities/team.entity.js';
import { Problem } from '../../problems/entities/problem.entity.js';
import { Testset } from '../../testsets/entities/testset.entity.js';
import { TestCase } from '../../testsets/entities/test-case.entity.js';
import { Blob } from '../../blobs/entities/blob.entity.js';
import { parseJsonPreservingIntegers } from '../../testsets/generation/canonical-json.js';
import { findLineBreaks } from '../../testsets/generation/signature.js';

@Injectable()
export class CategoriesService {

    constructor(
        @InjectRepository(Category)
        private readonly categoryRepository: Repository<Category>,
        private readonly editionService: EditionsService,
    ) {}

    getRepository(): Repository<Category> {
        return this.categoryRepository;
    }

    async getById(id: number): Promise<Category> {
        const category = await this.categoryRepository.findOne({ where: { id }})

        if(!category){
            throw new NotFoundException('category not found #' + id)
        }

        return category
    }

    // Obtiene la categoría y valida que pertenezca a la edición indicada
    async getByIdForEdition(id: number, editionId: number): Promise<Category> {
        const category = await this.getById(id)

        if(category.edition_id !== editionId){
            throw new BadRequestException('category #' + id + ' does not belong to edition #' + editionId)
        }

        return category
    }

    async findAllByEdition(editionId: number): Promise<ICategory[]> {
        await this.editionService.getById(editionId)

        return this.categoryRepository.find({
            where: {
                edition_id: editionId
            }
        })
    }

    async create(editionId: number, dto: CreateCategoryDto): Promise<ICategory> {
        const edition = await this.editionService.getById(editionId)
        this.editionService.assertIsEditable(edition)

        const category = this.categoryRepository.create()

        const nextIndex = await this.categoryRepository.count({
            where: {
                edition_id: editionId
            }
        })

        category.edition_id = edition.id
        category.code = dto.code
        category.name = dto.name
        category.full_program = dto.full_program ?? false
        category.sort_order = nextIndex + 1

        return this.categoryRepository.save(category)
    }

    async update(id: number, dto: UpdateCategoryDto): Promise<ICategory> {
        const category = await this.getById(id)

        const edition = await this.editionService.getById(category.edition_id)
        this.editionService.assertIsEditable(edition)

        const modeChanged = dto.full_program !== undefined && dto.full_program !== category.full_program

        return this.categoryRepository.manager.transaction(async (manager) => {
            if(modeChanged) await this.switchProblemsMode(manager, id, dto.full_program!)
            manager.merge(Category, category, dto)
            return manager.save(category)
        })
    }

    // Sus problemas cambian de modo con ella (programa-completo.md §1). Las salidas esperadas no dependen
    // del modo (la solución oficial siempre es una función), así que no hace falta reconstruir
    private async switchProblemsMode(manager: EntityManager, categoryId: number, fullProgram: boolean): Promise<void> {
        const problems = await manager.findBy(Problem, { category_id: categoryId })
        if(problems.length === 0) return

        const testsets = await manager.findBy(Testset, { problem_id: In(problems.map((problem) => problem.id)) })
        const titleOf = (testset: Testset) => problems.find((problem) => problem.id === testset.problem_id)!.title
        // Las versiones viejas ya construidas no se vuelven a usar: solo cuentan la actual y las que están en preparación
        const live = testsets.filter((testset) => testset.status !== TestsetStatus.READY
            || problems.some((problem) => problem.current_testset_id === testset.id))

        const errors: string[] = []
        for(const testset of live){
            if(testset.status === TestsetStatus.BUILDING){
                errors.push('problem "' + titleOf(testset) + '": testset v' + testset.version + ' is building; wait for it to finish')
            }
            if(fullProgram && testset.compare_mode === CompareMode.CHECKER){
                errors.push('problem "' + titleOf(testset) + '" uses a checker, which a full program cannot use')
            }
        }
        // Los borradores los revisa el build; los ya construidos se revisan aquí
        if(fullProgram) errors.push(...await this.findLineBreaksInReady(manager, problems, live))
        if(errors.length > 0){
            throw new ConflictException(errors)
        }

        await manager.update(Testset, { id: In(testsets.map((testset) => testset.id)) }, {
            compare_mode: fullProgram ? CompareMode.PROGRAM : CompareMode.EXACT,
        })
    }

    private async findLineBreaksInReady(manager: EntityManager, problems: Problem[], live: Testset[]): Promise<string[]> {
        const errors: string[] = []
        for(const testset of live.filter((testset) => testset.status === TestsetStatus.READY)){
            const problem = problems.find((problem) => problem.id === testset.problem_id)!
            if(!problem.signature || !JSON.stringify(problem.signature.params).includes('"string"')) continue

            const cases = await manager.findBy(TestCase, { testset_id: testset.id })
            const blobs = await manager.findBy(Blob, { sha: In([...new Set(cases.map((testCase) => testCase.input_sha))]) })
            for(const blob of blobs){
                const found = findLineBreaks(problem.signature, parseJsonPreservingIntegers(blob.bytes.toString('utf8')) as Record<string, unknown>)
                if(found.length > 0){
                    errors.push('problem "' + problem.title + '": ' + found[0])
                    break
                }
            }
        }
        return errors
    }

    async remove(id: number): Promise<void> {
        const category = await this.categoryRepository.findOneBy({ id })

        if(!category){
            throw new NotFoundException('category not found #' + id)
        }

        const edition = await this.editionService.getById(category.edition_id)
        this.editionService.assertIsEditable(edition)

        if(await this.categoryRepository.manager.existsBy(Team, { category_id: id })){
            throw new ConflictException('category #' + id + ' has teams assigned')
        }

        if(await this.categoryRepository.manager.existsBy(Problem, { category_id: id })){
            throw new ConflictException('category #' + id + ' has problems assigned')
        }

        await this.categoryRepository.delete([ id ])
    }
}
