import { Body, Controller, Get, Param, ParseIntPipe, Put } from "@nestjs/common";
import { UpdateEditionLanguages } from "../dto/update-edition-languages.dto.js";
import { EditionLanguagesService } from "../services/edition-languages.service.js";
import { RequireEditionRole, ANY_EDITION_ROLE, EditionScope } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

@Controller("editions/:id/languages")
export class EditionLanguagesController {
    constructor(
        private readonly _editionLanguagesService: EditionLanguagesService
    ) {

    }

    @Get()
    @RequireEditionRole(ANY_EDITION_ROLE, EditionScope.EDITION, 'id')
    getEditionLanguages(
        @Param("id", ParseIntPipe) id: number
    ){
        return this._editionLanguagesService.getAllLanguagesOfEdition(id)
    }

    @Put()
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.EDITION, 'id')
    setEditionLanguages(
        @Param("id", ParseIntPipe) id: number,
        @Body() dto: UpdateEditionLanguages
    ) {
        return this._editionLanguagesService.setLanguesOfEdition(id, dto)
    }
}