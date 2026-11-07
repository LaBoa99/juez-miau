import { IsObject, IsOptional } from 'class-validator';
import type { IGenerateTestset, ITestsetSchema } from '@concurso/shared-types';

export class GenerateTestsetDto implements IGenerateTestset {

    // Si viene, se guarda antes de generar; el contenido lo valida `validateSchema`
    @IsOptional()
    @IsObject()
    declare schema?: ITestsetSchema;
}
