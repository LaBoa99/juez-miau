import { IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CompareMode, type ITestsetSchema, type IUpdateTestset } from '@concurso/shared-types';

export class UpdateTestsetDto implements IUpdateTestset {

    @IsOptional()
    @IsInt()
    @Min(100)
    @Max(30000)
    declare timeLimitMs?: number;

    @IsOptional()
    @IsInt()
    @Min(16)
    @Max(2048)
    declare memoryLimitMb?: number;

    @IsOptional()
    @IsEnum(CompareMode)
    declare compareMode?: CompareMode;

    // null la quita
    @IsOptional()
    @IsNumber()
    @IsPositive()
    @Max(1)
    declare floatTolerance?: number | null;

    // null lo quita (y borra los casos generados); el contenido lo valida `validateSchema`
    @IsOptional()
    @IsObject()
    declare schema?: ITestsetSchema | null;

    @IsOptional()
    @IsBoolean()
    declare manualReview?: boolean;

    // null la quita
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(2000)
    declare reviewInstructions?: string | null;
}
