import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { IRoom, IRoomListItem } from '@concurso/shared-types';
import { Room } from '../entities/room.entity.js';
import { CreateRoomDto } from '../dto/create-room.dto.js';
import { UpdateRoomDto } from '../dto/update-room.dto.js';
import { EditionsService } from './editions.service.js';
import { Team } from '../../teams/entities/team.entity.js';
import { Category } from '../entities/category.entity.js';

@Injectable()
export class RoomsService {

    constructor(
        @InjectRepository(Room)
        private readonly roomRepository: Repository<Room>,
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
                observers: true,
                categories: true,
            },
            order: { id: 'ASC', categories: { sort_order: 'ASC' } },
        })
    }

    async create(editionId: number, dto: CreateRoomDto): Promise<IRoom> {
        const room = this.roomRepository.create()
        
        const edition = await this.editionService.getById(editionId)

        room.name = dto.name
        room.edition_id = edition.id
        room.categories = await this.categoriesOf(edition.id, dto.category_ids ?? [])

        return this.roomRepository.save(room)
    }

    async update(id: number, dto: UpdateRoomDto): Promise<IRoom> {
        const room = await this.getById(id)

        if(dto.name !== undefined) room.name = dto.name
        if(dto.category_ids !== undefined) room.categories = await this.categoriesOf(room.edition_id, dto.category_ids)

        return this.roomRepository.save(room)
    }

    private async categoriesOf(editionId: number, ids: number[]): Promise<Category[]> {
        if(ids.length === 0) return []
        const categories = await this.roomRepository.manager.findBy(Category, { id: In(ids), edition_id: editionId })
        if(categories.length !== ids.length){
            throw new NotFoundException('category not found in this edition')
        }
        return categories
    }

    async remove(id: number): Promise<void> {
        await this.getById(id)

        if(await this.roomRepository.manager.existsBy(Team, { room_id: id })){
            throw new ConflictException('room #' + id + ' has teams assigned')
        }
        await this.roomRepository.delete([ id ])
    }

}
