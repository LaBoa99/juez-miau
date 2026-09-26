import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator"

export class StaffLoginDto {
    @IsEmail()
    @MaxLength(254)
    declare email: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    declare password: string
}