import { ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Verdict, type IRejudge, type IRejudgeProblem } from '@concurso/shared-types';

export class RejudgeSubmissionDto implements IRejudge {

    // Queda en el historial del envío
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    declare reason: string;
}

export class RejudgeProblemDto extends RejudgeSubmissionDto implements IRejudgeProblem {

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsEnum(Verdict, { each: true })
    declare verdicts?: Verdict[];
}
