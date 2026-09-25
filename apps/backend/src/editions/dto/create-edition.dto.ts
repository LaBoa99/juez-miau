import { IsBoolean, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
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
}
