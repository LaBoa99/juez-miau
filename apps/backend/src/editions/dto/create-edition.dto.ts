import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import type { ICreateEdition } from '@concurso/shared-types';

export class CreateEditionDto implements ICreateEdition {

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare name: string;

    @IsInt()
    @Min(1)
    declare duration_ms: number;

    @IsInt()
    @Min(0)
    declare freeze_duration_ms: number;

    @IsBoolean()
    declare block_submissions_on_alert: boolean;

    // Nombres de proceso (sin ruta ni .exe) que el cliente del concursante reporta como alerta.
    // La coma no se permite: la columna es simple-array
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    @Matches(/^[^,]{1,100}$/, { each: true, message: 'each process name must be 1-100 characters without commas' })
    declare forbidden_processes?: string[];
}
