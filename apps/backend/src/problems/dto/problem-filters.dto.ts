import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import type { IProblemFilters } from '@concurso/shared-types';

export class ProblemFiltersDto implements IProblemFilters {

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    declare categoryId?: number;
}
