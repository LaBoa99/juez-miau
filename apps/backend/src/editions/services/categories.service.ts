import type { ICategory } from '@concurso/shared-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from '../dto/create-category.dto.js';
import { UpdateCategoryDto } from '../dto/update-category.dto.js';
import { Category } from '../entities/category.entity.js';
import { EditionsService } from './editions.service.js';

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
        category.sort_order = nextIndex + 1

        return this.categoryRepository.save(category)
    }

    async update(id: number, dto: UpdateCategoryDto): Promise<ICategory> {
        const category = await this.getById(id)

        const edition = await this.editionService.getById(category.edition_id)
        this.editionService.assertIsEditable(edition)

        this.categoryRepository.merge(category, dto)

        return this.categoryRepository.save(category)
    }

    // TODO: validar que no tenga equipos ni problemas asociados cuando existan esos módulos
    async remove(id: number): Promise<void> {
        const category = await this.categoryRepository.findOne({
            where: { id },
            relations: { rooms: true }
        })

        if(!category){
            throw new NotFoundException('category not found #' + id)
        }

        const edition = await this.editionService.getById(category.edition_id)
        this.editionService.assertIsEditable(edition)

        if(category.rooms.length > 0){
            throw new ConflictException('category #' + id + ' has rooms assigned')
        }

        await this.categoryRepository.delete([ id ])
    }
}
