import { IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { ICreateSubmission } from '@concurso/shared-types';
import { MAX_SOURCE_BYTES } from '../submissions.constants.js';

export class CreateSubmissionDto implements ICreateSubmission {

    @IsInt()
    @Min(1)
    declare problemId: number;

    @IsUUID()
    declare languageId: string;

    // El tope real es en bytes (UTF-8); el servicio lo revisa
    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_SOURCE_BYTES)
    declare source: string;
}
