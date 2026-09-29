import { Injectable } from "@nestjs/common";
import { LanguagesService } from "../../languages/services/languages.service.js";
import { EditionsService } from "./editions.service.js";
import { UpdateEditionLanguages } from "../dto/update-edition-languages.dto.js";
import { Language } from "../../languages/entities/language.entity.js";
import { Edition } from "../entities/edition.entity.js";

@Injectable()
export class EditionLanguagesService {

    constructor(
        private readonly _editionService: EditionsService,
        private readonly _languagesService: LanguagesService
    ){

    }

    getAllLanguagesOfEdition(id: number){
        return this._editionService
            .getRepository()
            .findOne({ 
                where: { id }, 
                relations: { languages: true }
            })
            .then(res => res?.languages ?? [])
            .then(languages => languages.map(l => ({
                code: l.code,
                active: l.active,
                time_multiplier: l.time_multiplier,
            })))
    }

    async setLanguesOfEdition(id: number, dto: UpdateEditionLanguages){
        const currentLanguages = await this._editionService.getRepository()
            .createQueryBuilder()
            .relation(Edition, 'languages')
            .of(id)
            .loadMany()
        
        const newLanguages = dto.ids.map(id => ({ id }))

        await this._editionService.getRepository()
        .createQueryBuilder()
        .relation(Edition, 'languages')
        .of(id)
        .addAndRemove(newLanguages, currentLanguages)
    }


}