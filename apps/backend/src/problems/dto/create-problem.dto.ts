import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { ICreateProblem } from '@concurso/shared-types';

export class CreateProblemDto implements ICreateProblem {

    @IsInt()
    @Min(1)
    declare categoryId: number;

    // "A".."Z", o dos letras si la categoría tiene más de 26 problemas
    @IsString()
    @Matches(/^[A-Z]{1,2}$/)
    declare letter: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare title: string;

    // markdown
    @IsString()
    @IsNotEmpty()
    declare statement: string;

    @IsString()
    @IsNotEmpty()
    declare inputFormat: string;

    @IsString()
    @IsNotEmpty()
    declare outputFormat: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100000)
    declare points?: number;
}
