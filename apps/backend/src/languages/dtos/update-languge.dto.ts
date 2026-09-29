import { PartialType } from "@nestjs/swagger";
import { CreateLanguageDto } from "./create-language.dto.js";

export class UpdateLanguageDto extends PartialType(CreateLanguageDto) {
    
}