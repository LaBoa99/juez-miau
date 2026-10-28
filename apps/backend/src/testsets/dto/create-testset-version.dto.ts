import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ICreateTestsetVersion } from '@concurso/shared-types';

export class CreateTestsetVersionDto implements ICreateTestsetVersion {

    // Por qué cambia el testset; queda en el historial de versiones
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    declare reason: string;
}
