import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ICreateCategory } from '@concurso/shared-types';

export class CreateCategoryDto implements ICreateCategory {

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare name: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare code: string;
}
