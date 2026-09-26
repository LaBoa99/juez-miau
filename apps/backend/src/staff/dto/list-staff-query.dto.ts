import { Transform } from "class-transformer"
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator"


export class ListStaffQueryDto {
    @IsOptional()
    @Transform(({ obj, key }) => {
        const v = obj[key]
        if (v === 'true') return true
        if (v === 'false') return false
        return v
    })
    @IsBoolean()
    active?: boolean

    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string
}