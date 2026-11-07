import { IsOptional, IsString, Matches } from 'class-validator';
import type { IDetectSignature } from '@concurso/shared-types';
import { SetRefSolutionDto } from './set-ref-solution.dto.js';

export class DetectSignatureDto extends SetRefSolutionDto implements IDetectSignature {

    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z_]\w{0,63}$/)
    declare functionName?: string;
}
