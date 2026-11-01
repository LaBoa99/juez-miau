import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { ICreateProblem } from '@concurso/shared-types';

export class CreateProblemDto implements ICreateProblem {

    @IsInt()
    @Min(1)
    declare categoryId: number;

    // "A".."Z", o dos letras si la categoría tiene más de 26 problemas.
    // Opcional: si no viene, el sistema asigna la siguiente libre de la categoría
    @IsOptional()
    @IsString()
    @Matches(/^[A-Z]{1,2}$/)
    declare letter?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare title: string;

    // markdown
    @IsString()
    @IsNotEmpty()
    declare statement: string;

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
