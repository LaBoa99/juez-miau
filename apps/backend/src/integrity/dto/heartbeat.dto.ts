import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { IHeartbeat } from '@concurso/shared-types';

export class HeartbeatDto implements IHeartbeat {

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(2000)
    @IsString({ each: true })
    @MaxLength(260, { each: true })
    declare processes?: string[];

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(64)
    declare monitors?: number;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @MaxLength(260, { each: true })
    declare usbStorage?: string[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    @MaxLength(260, { each: true })
    declare networkInterfaces?: string[];
}
