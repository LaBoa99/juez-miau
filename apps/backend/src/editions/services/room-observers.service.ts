import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffRole, type IRoomObserver } from '@concurso/shared-types';
import { RoomObserver } from '../entities/room-observer.entity.js';
import { RoomsService } from './rooms.service.js';
import { EditionStaffService } from './edition-staff.service.js';
import { CreateRoomObserverDto } from '../dto/create-room-observer.dto.js';

@Injectable()
export class RoomObserversService {

    constructor(
        @InjectRepository(RoomObserver)
        private readonly roomObserverRepository: Repository<RoomObserver>,
        private readonly roomsService: RoomsService,
        private readonly editionStaffService: EditionStaffService,
    ) {}

    getRepository(): Repository<RoomObserver> {
        return this.roomObserverRepository;
    }

    async assign(roomId: number, dto: CreateRoomObserverDto): Promise<IRoomObserver> {
        const room = await this.roomsService.getById(roomId)

        // Solo puede observar un salón quien esté asignado como OBSERVER en la edición del salón
        const staffMember = await this.editionStaffService.getRepository().findOne({
            where: {
                edition_id: room.edition_id,
                staff_user_id: dto.staff_user_id
            }
        })

        if(!staffMember || staffMember.role !== StaffRole.OBSERVER){
            throw new BadRequestException('staff user #' + dto.staff_user_id + ' is not an observer of edition #' + room.edition_id)
        }

        const alreadyAssigned = await this.roomObserverRepository.existsBy({
            room_id: roomId,
            staff_user_id: dto.staff_user_id
        })

        if(alreadyAssigned){
            throw new ConflictException('staff user #' + dto.staff_user_id + ' is already an observer of room #' + roomId)
        }

        const roomObserver = this.roomObserverRepository.create()

        roomObserver.room_id = roomId
        roomObserver.staff_user_id = dto.staff_user_id

        return this.roomObserverRepository.save(roomObserver)
    }

    async remove(roomId: number, staffUserId: number): Promise<void> {
        const result = await this.roomObserverRepository.delete({
            room_id: roomId,
            staff_user_id: staffUserId
        })

        if(!result.affected){
            throw new NotFoundException('staff user #' + staffUserId + ' is not an observer of room #' + roomId)
        }
    }

}
