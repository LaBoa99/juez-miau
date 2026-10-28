import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { IEditionStaff } from '@concurso/shared-types';
import { EditionStaffService } from '../services/edition-staff.service.js';
import { CreateEditionStaffDto } from '../dto/create-edition-staff.dto.js';
import type { EditionStaff } from '../entities/edition-staff.entity.js';
import { RequireEditionRole, ANY_EDITION_ROLE } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

@Controller('editions/:editionId/staff')
export class EditionStaffController {

    constructor(
        private readonly editionStaffService: EditionStaffService,
    ) {}

    @Get()
    @RequireEditionRole(ANY_EDITION_ROLE)
    getStaffMembersOfEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
    ): Promise<EditionStaff[]> {
        return this.editionStaffService.findAllByEdition(editionId);
    }

    @Post()
    @RequireEditionRole([StaffRole.ADMIN])
    assignStaffToEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Body() dto: CreateEditionStaffDto,
    ): Promise<IEditionStaff> {
        return this.editionStaffService.assign(editionId, dto);
    }

    @Delete(':staffUserId')
    @RequireEditionRole([StaffRole.ADMIN])
    @HttpCode(HttpStatus.NO_CONTENT)
    removeStaffOfEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Param('staffUserId', ParseIntPipe) staffUserId: number,
    ): Promise<void> {
        return this.editionStaffService.remove(editionId, staffUserId);
    }
}
