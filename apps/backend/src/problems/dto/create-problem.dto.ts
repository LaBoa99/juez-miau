import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ICreateProblem } from '@concurso/shared-types';

export class CreateProblemDto implements ICreateProblem {

    @IsInt()
    @Min(1)
    declare categoryId: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare title: string;

    // markdown; vacío cuando el enunciado será un PDF (se sube después con PUT /problems/:id/statement-pdf)
    @IsOptional()
    @IsString()
    declare statement?: string;

    // Opcionales: la firma y los ejemplos (casos públicos) ya dicen qué entra y qué sale
    @IsOptional()
    @IsString()
    declare inputFormat?: string;

    @IsOptional()
    @IsString()
    declare outputFormat?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100000)
    declare points?: number;
}
