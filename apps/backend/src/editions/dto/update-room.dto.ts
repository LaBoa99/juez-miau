import { PartialType } from '@nestjs/swagger';
import type { IUpdateRoom } from '@concurso/shared-types';
import { CreateRoomDto } from './create-room.dto.js';

export class UpdateRoomDto extends PartialType(CreateRoomDto) implements IUpdateRoom {}
