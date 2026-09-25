import { ICreateTeamMember, IUpdateCategory, IUpdateTeam } from "@concurso/shared-types";
import { PartialType, OmitType } from "@nestjs/swagger"; // Añadimos OmitType
import { CreateTeamDto } from "./create-team.dto.js";
import { Type } from "class-transformer";
import { IsOptional, IsArray, ValidateNested, IsNumber, IsInt, IsPositive } from "class-validator";
import { UpdateTeamMemberDto } from "./update-team-member.dto.js";


class TeamWithoutMembers extends OmitType(CreateTeamDto, ['members'] as const) {}

export class UpdateTeamDto extends PartialType(TeamWithoutMembers) implements IUpdateTeam {

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateTeamMemberDto) 
    members ?: UpdateTeamMemberDto[]; 

    @IsOptional()
    @IsInt()
    @IsPositive()
    room_id ?: number

}