import { EditionStatus, type IEdition, type IEditionListItem, type IEditionScheduleResponse } from '@concurso/shared-types';
import { ConflictException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEditionDto } from '../dto/create-edition.dto.js';
import { EditionFiltersDto } from '../dto/edition-filters.dto.js';
import { ScheduleEditionDto } from '../dto/schedule-edition.dto.js';
import { UpdateEditionDto } from '../dto/update-edition.dto.js';
import { Edition } from '../entities/edition.entity.js';

@Injectable()
export class EditionsService {

    constructor(
        @InjectRepository(Edition)
        private readonly editionRepository: Repository<Edition>,
    ) {}

    getRepository(): Repository<Edition> {
        return this.editionRepository;
    }

    async getById(id: number){
        const edition = await this.editionRepository.findOne({ where: { id }})
        if(!edition){
            throw new NotFoundException('edition not found #' + id)
        }
        return edition
    }

    // La configuración de una edición (y sus categorías) solo se modifica antes de iniciar el concurso
    assertIsEditable(edition: Edition): void {
        if(edition.status !== EditionStatus.DRAFT && edition.status !== EditionStatus.SCHEDULED){
            throw new ConflictException('edition #' + edition.id + ' can only be modified before it starts')
        }
    }

    async findAll(filters: EditionFiltersDto): Promise<IEditionListItem[]> {
        
        return this.editionRepository.find({
            where: {
                ...(filters.status && { status: filters.status })
            },
            relations: {
                categories: true
            }
        })
    }

    async findById(id: number): Promise<Edition> {
        const edition = await this.editionRepository.findOne({
            where: { id },
            relations: {
                categories: true,
                rooms: true
            }
        })
        if(!edition){
            throw new NotFoundException('edition not found #' + id)
        }
        return edition
    }

    async create(dto: CreateEditionDto): Promise<IEdition> {
        const edition = this.editionRepository.create()

        edition.name = dto.name
        edition.block_submissions_on_alert = dto.block_submissions_on_alert
        edition.duration_ms = dto.duration_ms
        edition.freeze_duration_ms = dto.freeze_duration_ms

        return this.editionRepository.save(edition)
    }

    async update(id: number, dto: UpdateEditionDto): Promise<IEdition> {
        const edition = await this.getById(id)

        this.assertIsEditable(edition)

        this.editionRepository.merge(edition, dto)

        return this.editionRepository.save(edition)
    }

    // TODO: validar que haya problemas publicados y equipos (RF-06) cuando existan esos módulos
    async schedule(id: number, dto: ScheduleEditionDto): Promise<IEditionScheduleResponse> {
        // pendiente 
        throw new NotImplementedException()
    }

    async remove(id: number): Promise<void> {
        const edition = await this.getById(id)

        if(edition.status !== EditionStatus.DRAFT){
            throw new ConflictException('edition #' + id + ' can only be deleted while it is a draft')
        }

        await this.editionRepository.delete([ id ])
    }

}
