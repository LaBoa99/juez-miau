import { IsNotEmpty, IsString, MaxLength } from "class-validator"

export class TeamLoginDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    declare username: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    declare password: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    declare machineId: string
}