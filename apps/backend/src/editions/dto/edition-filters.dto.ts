import { PartialType, PickType } from '@nestjs/swagger';
import type { IEditionFilters } from '@concurso/shared-types';
import { Edition } from '../entities/edition.entity.js';

export class EditionFiltersDto extends PartialType(PickType(Edition, ['status'] as const)) implements IEditionFilters {}
