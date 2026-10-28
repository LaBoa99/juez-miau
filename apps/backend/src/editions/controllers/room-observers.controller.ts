import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { IRoomObserver } from '@concurso/shared-types';
import { RoomObserversService } from '../services/room-observers.service.js';
import { CreateRoomObserverDto } from '../dto/create-room-observer.dto.js';
import { RequireEditionRole, EditionScope } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

@Controller('rooms/:roomId/observers')
export class RoomObserversController {

    constructor(
        private readonly roomObserversService: RoomObserversService,
    ) {}

    @Post()
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.ROOM, 'roomId')
    assignObserverToRoom(
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() dto: CreateRoomObserverDto,
    ): Promise<IRoomObserver> {
        return this.roomObserversService.assign(roomId, dto);
    }

    @Delete(':staffUserId')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.ROOM, 'roomId')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeObserverOfRoom(
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('staffUserId', ParseIntPipe) staffUserId: number,
    ): Promise<void> {
        return this.roomObserversService.remove(roomId, staffUserId);
    }
}
