import type { ICategory } from '@concurso/shared-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from '../dto/create-category.dto.js';
import { UpdateCategoryDto } from '../dto/update-category.dto.js';
import { Category } from '../entities/category.entity.js';
import { EditionsService } from './editions.service.js';
import { Team } from '../../teams/entities/team.entity.js';
import { Problem } from '../../problems/entities/problem.entity.js';

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

        // Sus problemas ya tienen el modo de evaluación de antes (programa-completo.md §1)
        if(dto.full_program !== undefined && dto.full_program !== category.full_program
            && await this.categoryRepository.manager.existsBy(Problem, { category_id: id })){
            throw new ConflictException('category #' + id + ' has problems; full_program can only change while it has none')
        }

        this.categoryRepository.merge(category, dto)

        return this.categoryRepository.save(category)
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
