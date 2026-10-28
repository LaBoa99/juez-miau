import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { TestCaseVisibility, type IUpdateTestCase } from '@concurso/shared-types';

export class UpdateTestCaseDto implements IUpdateTestCase {

    // Solo en casos manuales; los generados se cambian regenerando
    @IsOptional()
    @IsObject()
    declare input?: Record<string, unknown>;

    @IsOptional()
    @IsEnum(TestCaseVisibility)
    declare visibility?: TestCaseVisibility;
}
