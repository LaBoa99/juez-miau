import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { IRoom, IRoomListItem } from '@concurso/shared-types';
import { EditionRoomsService } from '../services/edition-rooms.service.js';
import { CreateRoomDto } from '../dto/create-room.dto.js';
import { RequireEditionRole, ANY_EDITION_ROLE } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

@Controller('editions/:editionId/rooms')
export class EditionRoomsController {

    constructor(
        private readonly editionRoomsService: EditionRoomsService,
    ) {}

    @Get()
    @RequireEditionRole(ANY_EDITION_ROLE)
    getAllRoomsOfEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
    ): Promise<IRoomListItem[]> {
        return this.editionRoomsService.findAllByEdition(editionId);
    }

    @Post()
    @RequireEditionRole([StaffRole.ADMIN])
    createRoomForEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Body() dto: CreateRoomDto,
    ): Promise<IRoom> {
        return this.editionRoomsService.createForEdition(editionId, dto);
    }

}
