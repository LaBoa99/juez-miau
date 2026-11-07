import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { TestCaseVisibility, type ICreateTestCase, type ICreateTestCases } from '@concurso/shared-types';
import { MAX_TESTSET_CASES } from '../generation/limits.js';

export class CreateTestCaseDto implements ICreateTestCase {

    // Una llave por parámetro de la firma; lo valida `normalizeInput`
    @IsObject()
    declare input: Record<string, unknown>;

    // Por defecto oculto; los públicos se muestran como ejemplos en el enunciado
    @IsOptional()
    @IsEnum(TestCaseVisibility)
    declare visibility?: TestCaseVisibility;

    // Grupo con nombre (p. ej. "bordes"); null o vacío = sin grupo ("Manuales" en el panel)
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(64)
    declare group?: string | null;
}

// Varios casos de una vez (pegados en el panel, uno por línea): todos o ninguno
export class CreateTestCasesDto implements ICreateTestCases {

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_TESTSET_CASES)
    @ValidateNested({ each: true })
    @Type(() => CreateTestCaseDto)
    declare cases: CreateTestCaseDto[];
}
