import { ICreateTeamMember } from "@concurso/shared-types";
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class CreateTeamMemberDto implements ICreateTeamMember {
    
    @IsNotEmpty()
    @IsString()
    name: string;
    
    @IsNotEmpty()
    @IsString()
    career: string;

    @IsOptional()
    @IsInt()
    @IsPositive()
    semestre?: number | undefined;

}