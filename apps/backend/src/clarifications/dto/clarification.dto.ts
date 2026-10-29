import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { IAnswerClarification, ICreateClarification } from '@concurso/shared-types';

// Solo recorta los extremos: los saltos de línea del texto se conservan
const trimEnds = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateClarificationDto implements ICreateClarification {

    @IsOptional()
    @IsInt()
    @Min(1)
    declare problemId?: number | null;

    @Transform(trimEnds)
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    declare question: string;
}

export class AnswerClarificationDto implements IAnswerClarification {

    @Transform(trimEnds)
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    declare answer: string;
}
