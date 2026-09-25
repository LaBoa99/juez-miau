import { PartialType } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsOptional, IsPositive } from "class-validator";
import { CreateTeamMemberDto } from "./create-team-member.dto.js";

export class UpdateTeamMemberDto extends PartialType(CreateTeamMemberDto) {

    @IsOptional()
    @IsInt() 
    @IsPositive()
    id ?: number; 
}
