import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { ICreateFlag, IResolveFlag } from '@concurso/shared-types';

export class CreateFlagDto implements ICreateFlag {

    @IsInt()
    @Min(1)
    declare teamId: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    declare details: string;
}

export class ResolveFlagDto implements IResolveFlag {

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    declare note?: string;
}

export class FlagFiltersDto {

    // ?open=true: solo las que no se han resuelto
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    declare open?: boolean;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt()
    declare teamId?: number;
}
