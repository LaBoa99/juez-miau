import type { ICategory } from '@concurso/shared-types';
import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from '../dto/create-category.dto.js';
import { CategoriesService } from './categories.service.js';

@Injectable()
export class EditionCategoriesService {

    constructor(
        private readonly categoriesService: CategoriesService,
    ) {}

    async findAllByEdition(editionId: number): Promise<ICategory[]> {
        return this.categoriesService.findAllByEdition(editionId)
    }

    async createForEdition(editionId: number, dto: CreateCategoryDto): Promise<ICategory> {
        return this.categoriesService.create(editionId, dto)
    }

}
