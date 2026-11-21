import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BackToDraftDto {

    // El admin lo pide al regresarlo; el autor que lo regresa él mismo no tiene que darlo
    @IsOptional()
    @IsString()
    @MaxLength(500)
    declare reason?: string;
}
