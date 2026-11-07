import { IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { TestCaseVisibility, type IUpdateCasesVisibility, type IUpdateTestCase } from '@concurso/shared-types';

export class UpdateTestCaseDto implements IUpdateTestCase {

    // Solo en casos manuales; los generados se cambian regenerando
    @IsOptional()
    @IsObject()
    declare input?: Record<string, unknown>;

    @IsOptional()
    @IsEnum(TestCaseVisibility)
    declare visibility?: TestCaseVisibility;

    // Solo en casos manuales; null lo saca de su grupo
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(64)
    declare group?: string | null;
}

export class UpdateCasesVisibilityDto implements IUpdateCasesVisibility {

    // null = casos manuales
    @ValidateIf((_, value) => value !== null)
    @IsString()
    declare group: string | null;

    @IsEnum(TestCaseVisibility)
    declare visibility: TestCaseVisibility;
}
