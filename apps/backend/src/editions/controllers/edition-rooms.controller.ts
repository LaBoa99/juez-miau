import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { IRoom, IRoomListItem } from '@concurso/shared-types';
import { EditionRoomsService } from '../services/edition-rooms.service.js';
import { CreateRoomDto } from '../dto/create-room.dto.js';

@Controller('editions/:editionId/rooms')
export class EditionRoomsController {

    constructor(
        private readonly editionRoomsService: EditionRoomsService,
    ) {}

    @Get()
    getAllRoomsOfEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
    ): Promise<IRoomListItem[]> {
        return this.editionRoomsService.findAllByEdition(editionId);
    }

    @Post()
    createRoomForEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Body() dto: CreateRoomDto,
    ): Promise<IRoom> {
        return this.editionRoomsService.createForEdition(editionId, dto);
    }

}
