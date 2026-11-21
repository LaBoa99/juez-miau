import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import type { ICreateRoom } from '@concurso/shared-types';

export class CreateRoomDto implements ICreateRoom {

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare name: string;

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsInt({ each: true })
    @IsPositive({ each: true })
    declare category_ids?: number[];
}
