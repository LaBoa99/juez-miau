import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import type { IEdition, IEditionDetail, IEditionListItem, IEditionScheduleResponse } from '@concurso/shared-types';
import { EditionsService } from '../services/editions.service.js';
import { EditionFiltersDto } from '../dto/edition-filters.dto.js';
import { CreateEditionDto } from '../dto/create-edition.dto.js';
import { UpdateEditionDto } from '../dto/update-edition.dto.js';
import { ScheduleEditionDto } from '../dto/schedule-edition.dto.js';
import { RequireEditionRole, ANY_EDITION_ROLE, EditionScope, SuperadminOnly } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

@Controller('editions')
export class EditionsController {

    constructor(
        private readonly editionsService: EditionsService,
    ) {}

    @Get()
    getAllEditions(
        @Query() filters: EditionFiltersDto,
    ): Promise<IEditionListItem[]> {
        return this.editionsService.findAll(filters);
    }

    @Post()
    @SuperadminOnly()
    createEdition(
        @Body() dto: CreateEditionDto,
    ): Promise<IEdition> {
        return this.editionsService.create(dto);
    }

    @Get(':id')
    @RequireEditionRole(ANY_EDITION_ROLE, EditionScope.EDITION, 'id')
    getEditionById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<any> {
        return this.editionsService.findById(id);
    }

    @Patch(':id')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.EDITION, 'id')
    updateEdition(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateEditionDto,
    ): Promise<IEdition> {
        return this.editionsService.update(id, dto);
    }

    @Post(':id/schedule')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.EDITION, 'id')
    @HttpCode(HttpStatus.OK)
    scheduleEdition(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ScheduleEditionDto,
    ): Promise<IEditionScheduleResponse> {
        return this.editionsService.schedule(id, dto);
    }

    @Delete(':id')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.EDITION, 'id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteEdition(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<void> {
        return this.editionsService.remove(id);
    }

}
