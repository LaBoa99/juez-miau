import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { IReviewSubmission } from '@concurso/shared-types';

export class ReviewSubmissionDto implements IReviewSubmission {

    // true → AC; false → WA (cuenta como rechazo para la penalización)
    @IsBoolean()
    declare accept: boolean;

    // Lo ve el equipo
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    declare comment?: string;
}
