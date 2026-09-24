import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseIntPipe, Patch } from '@nestjs/common';
import type { IRoom } from '@concurso/shared-types';
import { RoomsService } from '../services/rooms.service.js';
import { UpdateRoomDto } from '../dto/update-room.dto.js';

@Controller('rooms')
export class RoomsController {

    constructor(
        private readonly roomsService: RoomsService,
    ) {}

    @Patch(':id')
    updateRoom(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateRoomDto,
    ): Promise<IRoom> {
        return this.roomsService.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteRoom(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<void> {
        return this.roomsService.remove(id);
    }
}
