import { ICreateLanguage } from "@concurso/shared-types";
import { Transform } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max, MaxLength } from "class-validator";
import { fileExtension, trim, trimLower } from "../../common/transformers/string.transformers.js";

export class CreateLanguageDto implements ICreateLanguage {

    @Transform(trimLower)
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    code: string;

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    image_ref: string;

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    compile_cmd: string;

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    run_cmd: string;

    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    compiler_version: string;

    @Transform(trim)
    @IsOptional()
    @IsString()
    flags?: string;

    @Transform(fileExtension)
    @IsString()
    @Length(1, 4)
    @Matches(/^[a-z0-9]+$/, { message: "file_ext must contain only letters and numbers" })
    file_ext: string;

    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    @Max(99.99)
    time_multiplier: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

}
