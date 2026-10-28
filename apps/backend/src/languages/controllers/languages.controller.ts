import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { LanguagesService } from "../services/languages.service.js";
import { CreateLanguageDto } from "../dtos/create-language.dto.js";
import { SuperadminOnly } from '../../auth/decorators/access.decorators.js';

@Controller("languages")
export class LanguagesController {

    constructor(
        private readonly _languageService: LanguagesService
    ){

    }

    @Get()
    async getLanguages(){
        return this._languageService.getAllLanguages()
    }

    @Post()
    @SuperadminOnly()
    async addLanguages(
        @Body() dto: CreateLanguageDto
    ){
        return this._languageService.create(dto)
    }

    @Patch(":uuid")
    @SuperadminOnly()
    async toggleActiveOfLanguage(
        @Param("uuid") uuid: string
    ){
        return this._languageService.toggleLanguage(uuid)
    }
}