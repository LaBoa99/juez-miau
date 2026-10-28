import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SubmissionStatus, Verdict } from '@concurso/shared-types';

export class SubmissionFiltersDto {

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    declare teamId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    declare problemId?: number;

    @IsOptional()
    @IsEnum(Verdict)
    declare verdict?: Verdict;

    @IsOptional()
    @IsEnum(SubmissionStatus)
    declare status?: SubmissionStatus;

    // Paginación hacia atrás: envíos con id menor a este
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    declare before?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    declare limit?: number;
}
