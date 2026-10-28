import { Controller, Delete, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { IProjectorTokenResponse } from '@concurso/shared-types';
import { RoomProyectorsService } from '../services/room-proyectors.service.js';
import { RequireEditionRole, EditionScope } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

@Controller('rooms/:roomId/board-token')
export class RoomProyectorsController {

    constructor(
        private readonly roomProyectorsService: RoomProyectorsService,
    ) {}

    @Post()
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.ROOM, 'roomId')
    generateTokenForProyector(
        @Param('roomId', ParseIntPipe) roomId: number,
    ): Promise<IProjectorTokenResponse> {
        return this.roomProyectorsService.assignTokenForRoom(roomId);
    }

    @Delete()
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.ROOM, 'roomId')
    @HttpCode(HttpStatus.NO_CONTENT)
    revokeToken(
        @Param('roomId', ParseIntPipe) roomId: number,
    ): Promise<void> {
        return this.roomProyectorsService.revokeTokenOfRoom(roomId);
    }

}
