import type { IChangePassword } from '@concurso/shared-types'
import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator"

export class ChangePasswordDto implements IChangePassword {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    declare currentPassword: string

    // Mismas reglas que al crear una cuenta de staff
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    declare newPassword: string
}
