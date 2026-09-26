import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class CreateStaffDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsEmail()
    @MaxLength(254)
    email: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    password: string;

}