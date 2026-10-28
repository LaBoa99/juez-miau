import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { TestCaseVisibility, type ICreateTestCase } from '@concurso/shared-types';

export class CreateTestCaseDto implements ICreateTestCase {

    // Una llave por parámetro de la firma; lo valida `normalizeInput`
    @IsObject()
    declare input: Record<string, unknown>;

    // Por defecto oculto; los públicos se muestran como ejemplos en el enunciado
    @IsOptional()
    @IsEnum(TestCaseVisibility)
    declare visibility?: TestCaseVisibility;
}
