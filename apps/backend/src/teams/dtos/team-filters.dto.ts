import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class TeamFiltersDto {

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    declare categoryId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    declare roomId?: number;

    // busca por nombre del equipo o usuario
    @IsOptional()
    @IsString()
    @MaxLength(255)
    declare search?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize: number = 20;
}
