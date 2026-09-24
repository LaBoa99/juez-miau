import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { IRoomObserver } from '@concurso/shared-types';
import { RoomObserversService } from '../services/room-observers.service.js';
import { CreateRoomObserverDto } from '../dto/create-room-observer.dto.js';

@Controller('rooms/:roomId/observers')
export class RoomObserversController {

    constructor(
        private readonly roomObserversService: RoomObserversService,
    ) {}

    @Post()
    assignObserverToRoom(
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() dto: CreateRoomObserverDto,
    ): Promise<IRoomObserver> {
        return this.roomObserversService.assign(roomId, dto);
    }

    @Delete(':staffUserId')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeObserverOfRoom(
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('staffUserId', ParseIntPipe) staffUserId: number,
    ): Promise<void> {
        return this.roomObserversService.remove(roomId, staffUserId);
    }
}
