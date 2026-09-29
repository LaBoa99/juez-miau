import { Body, Controller, Get, Param, ParseIntPipe, Put } from "@nestjs/common";
import { UpdateEditionLanguages } from "../dto/update-edition-languages.dto.js";
import { EditionLanguagesService } from "../services/edition-languages.service.js";

@Controller("editions/:id/languages")
export class EditionLanguagesController {
    constructor(
        private readonly _editionLanguagesService: EditionLanguagesService
    ) {

    }

    @Get()
    getEditionLanguages(
        @Param("id", ParseIntPipe) id: number
    ){
        return this._editionLanguagesService.getAllLanguagesOfEdition(id)
    }

    @Put()
    setEditionLanguages(
        @Param("id", ParseIntPipe) id: number,
        @Body() dto: UpdateEditionLanguages
    ) {
        return this._editionLanguagesService.setLanguesOfEdition(id, dto)
    }
}