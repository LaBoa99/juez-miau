import { PickType } from '@nestjs/swagger';
import type { ICreateRoom } from '@concurso/shared-types';
import { Room } from '../entities/room.entity.js';

export class CreateRoomDto extends PickType(Room, [
    'name',
    'category_id',
] as const) implements ICreateRoom {}
