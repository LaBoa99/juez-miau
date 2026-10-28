import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import type { ISetRefSolution } from '@concurso/shared-types';

export class SetRefSolutionDto implements ISetRefSolution {

    @IsUUID()
    declare languageId: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(256 * 1024)
    declare source: string;
}
