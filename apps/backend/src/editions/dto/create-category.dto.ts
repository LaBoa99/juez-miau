import { PickType } from '@nestjs/swagger';
import type { ICreateCategory } from '@concurso/shared-types';
import { Category } from '../entities/category.entity.js';

export class CreateCategoryDto extends PickType(Category, [
    'name',
    'code',
] as const) implements ICreateCategory {}
