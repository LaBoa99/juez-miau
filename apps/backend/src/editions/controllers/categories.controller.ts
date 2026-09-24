import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseIntPipe, Patch } from '@nestjs/common';
import type { ICategory } from '@concurso/shared-types';
import { CategoriesService } from '../services/categories.service.js';
import { UpdateCategoryDto } from '../dto/update-category.dto.js';

@Controller('categories')
export class CategoriesController {

    constructor(
        private readonly categoriesService: CategoriesService,
    ) {}

    @Patch(':id')
    updateCategory(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCategoryDto,
    ): Promise<ICategory> {
        return this.categoriesService.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteCategory(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<void> {
        return this.categoriesService.remove(id);
    }
}
