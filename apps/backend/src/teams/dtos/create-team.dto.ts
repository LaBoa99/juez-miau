import { ICreateTeam, ICreateTeamMember } from "@concurso/shared-types";
import { Type } from "class-transformer";
import { IsArray, IsNotEmpty, IsNumber, IsPositive, IsString, Length, ValidateNested } from "class-validator";

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
    @Type(() => CreateTeamDto)
    members: ICreateTeamMember[];

}