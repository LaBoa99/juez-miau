import { IsEnum, IsOptional } from 'class-validator';
import { EditionStatus, type IEditionFilters } from '@concurso/shared-types';

export class EditionFiltersDto implements IEditionFilters {

    @IsOptional()
    @IsEnum(EditionStatus)
    declare status?: EditionStatus;
}
