import { PickType } from '@nestjs/swagger';
import type { ICreateRoomObserver } from '@concurso/shared-types';
import { RoomObserver } from '../entities/room-observer.entity.js';

export class CreateRoomObserverDto extends PickType(RoomObserver, [
    'staff_user_id',
] as const) implements ICreateRoomObserver {}
