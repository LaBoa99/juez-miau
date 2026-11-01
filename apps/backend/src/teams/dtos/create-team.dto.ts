import { ICreateTeam, ICreateTeamMember } from "@concurso/shared-types";
import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length, Max, Min, ValidateNested } from "class-validator";

export class CreateTeamMemberDto implements ICreateTeamMember {

    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    name: string;

    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    career: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(20)
    semestre?: number;

}

export class CreateTeamDto implements ICreateTeam {

    @IsNotEmpty()
    @IsString()
    @Length(1, 255)
    name: string;

    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    category_id: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTeamMemberDto)
    members: ICreateTeamMember[];

}
