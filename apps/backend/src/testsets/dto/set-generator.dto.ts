import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Matches, ValidateNested } from 'class-validator';
import type { IGeneratorGroup, ISetGenerator } from '@concurso/shared-types';
import { MAX_TESTSET_CASES } from '../generation/limits.js';
import { SetRefSolutionDto } from './set-ref-solution.dto.js';

export class GeneratorGroupDto implements IGeneratorGroup {

    @IsString()
    @Matches(/^[\w-]{1,32}$/, { message: 'name must be 1-32 letters, digits, _ or -' })
    declare name: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_TESTSET_CASES)
    @IsInt({ each: true })
    declare seeds: number[];
}

export class SetGeneratorDto extends SetRefSolutionDto implements ISetGenerator {

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => GeneratorGroupDto)
    declare groups: GeneratorGroupDto[];
}

// El checker es código y lenguaje, igual que la solución oficial
export class SetCheckerDto extends SetRefSolutionDto {}

