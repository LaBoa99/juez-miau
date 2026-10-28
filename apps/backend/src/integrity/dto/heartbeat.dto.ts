import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import type { IHeartbeat } from '@concurso/shared-types';

export class HeartbeatDto implements IHeartbeat {

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(2000)
    @IsString({ each: true })
    @MaxLength(260, { each: true })
    declare processes?: string[];
}
