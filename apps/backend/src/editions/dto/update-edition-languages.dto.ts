import { ILanguageSetEdition } from "@concurso/shared-types";
import { IsArray, IsUUID } from "class-validator";

export class UpdateEditionLanguages implements ILanguageSetEdition {
    @IsArray()
    @IsUUID('all', { each: true })
    ids: string[];
}