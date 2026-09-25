import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { ICreateRoom } from '@concurso/shared-types';

export class CreateRoomDto implements ICreateRoom {

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare name: string;

    // null = salón sin categoría
    @IsOptional()
    @IsInt()
    @Min(1)
    declare category_id?: number | null;
}
