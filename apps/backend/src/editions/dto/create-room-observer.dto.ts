import { IsInt, Min } from 'class-validator';
import type { ICreateRoomObserver } from '@concurso/shared-types';

export class CreateRoomObserverDto implements ICreateRoomObserver {

    @IsInt()
    @Min(1)
    declare staff_user_id: number;
}
