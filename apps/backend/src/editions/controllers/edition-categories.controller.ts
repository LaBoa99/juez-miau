import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { ICategory } from '@concurso/shared-types';
import { EditionCategoriesService } from '../services/edition-categories.service.js';
import { CreateCategoryDto } from '../dto/create-category.dto.js';

@Controller('editions/:editionId/categories')
export class EditionCategoriesController {

    constructor(
        private readonly editionCategoriesService: EditionCategoriesService,
    ) {}

    @Get()
    getAllCategoriesOfEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
    ): Promise<ICategory[]> {
        return this.editionCategoriesService.findAllByEdition(editionId);
    }

    @Post()
    createCategoryForEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Body() dto: CreateCategoryDto,
    ): Promise<ICategory> {
        return this.editionCategoriesService.createForEdition(editionId, dto);
    }

}
