import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import type { IRoom, IRoomListItem } from '@concurso/shared-types';
import { RoomsService } from './rooms.service.js';
import { CreateRoomDto } from '../dto/create-room.dto.js';
import { Room } from '../entities/room.entity.js';

@Injectable()
export class EditionRoomsService {

    constructor(
        private readonly roomsService: RoomsService,
    ) {}

    getRepository(): Repository<Room> {
        return this.roomsService.getRepository();
    }

    async findAllByEdition(editionId: number): Promise<IRoomListItem[]> {
        return this.roomsService.findAllByEdition(editionId)
    }

    async createForEdition(editionId: number, dto: CreateRoomDto): Promise<IRoom> {
        return this.roomsService.create(editionId, dto)
    }

}
