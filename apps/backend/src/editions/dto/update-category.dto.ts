import { PartialType } from '@nestjs/swagger';
import type { IUpdateCategory } from '@concurso/shared-types';
import { CreateCategoryDto } from './create-category.dto.js';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) implements IUpdateCategory {}
