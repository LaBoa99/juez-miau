import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateStaffDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsEmail()
    @MaxLength(254)
    email: string;

    // Sin contraseña se genera una, como a los equipos
    @IsOptional()
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    password?: string;

}