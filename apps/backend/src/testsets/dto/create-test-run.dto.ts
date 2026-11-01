import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { ICreateTestRun } from '@concurso/shared-types';
import { MAX_SOURCE_BYTES } from '../../submissions/submissions.constants.js';

export class CreateTestRunDto implements ICreateTestRun {

    @IsOptional()
    @IsUUID()
    declare languageId?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_SOURCE_BYTES)
    declare source?: string;

    @IsOptional()
    @IsBoolean()
    declare useRefSolution?: boolean;

    @IsOptional()
    @IsBoolean()
    declare verify?: boolean;
}
