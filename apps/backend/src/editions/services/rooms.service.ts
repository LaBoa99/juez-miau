import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IRoom, IRoomListItem } from '@concurso/shared-types';
import { Room } from '../entities/room.entity.js';
import { CreateRoomDto } from '../dto/create-room.dto.js';
import { UpdateRoomDto } from '../dto/update-room.dto.js';
import { CategoriesService } from './categories.service.js';
import { EditionsService } from './editions.service.js';
import { Team } from '../../teams/entities/team.entity.js';

@Injectable()
export class RoomsService {

    constructor(
        @InjectRepository(Room)
        private readonly roomRepository: Repository<Room>,
        private readonly categoryService: CategoriesService,
        private readonly editionService: EditionsService,
    ) {}

    getRepository(): Repository<Room> {
        return this.roomRepository;
    }

    async getById(id: number): Promise<Room> {
        const room = await this.roomRepository.findOne({ where: { id }})
        if(!room){
            throw new NotFoundException('room not found #' + id)
        }
        return room
    }

    async findAllByEdition(editionId: number): Promise<IRoomListItem[]> {
        await this.editionService.getById(editionId)

        return this.roomRepository.find({
            where: {
                edition_id: editionId
            },
            relations: {
                observers: true
            }
        })
    }

    async create(editionId: number, dto: CreateRoomDto): Promise<IRoom> {
        const room = this.roomRepository.create()
        
        const edition = await this.editionService.getById(editionId)

        if(dto.category_id){
            await this.categoryService.getByIdForEdition(dto.category_id, edition.id)
        }

        room.name = dto.name
        room.edition_id = edition.id
        room.category_id = dto.category_id ?? null

        return this.roomRepository.save(room)
    }

    async update(id: number, dto: UpdateRoomDto): Promise<IRoom> {
        const room = await this.getById(id)

        // undefined = no se envió (no cambia), null = quitar la categoría
        if(dto.category_id){
            await this.categoryService.getByIdForEdition(dto.category_id, room.edition_id)
        }

        this.roomRepository.merge(room, dto)

        return this.roomRepository.save(room)
    }

    async remove(id: number): Promise<void> {
        await this.getById(id)

        if(await this.roomRepository.manager.existsBy(Team, { room_id: id })){
            throw new ConflictException('room #' + id + ' has teams assigned')
        }
        await this.roomRepository.delete([ id ])
    }

}
