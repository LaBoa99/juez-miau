import { EditionStatus, ProblemStatus, type IEdition, type IEditionListItem, type IEditionScheduleResponse } from '@concurso/shared-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEditionDto } from '../dto/create-edition.dto.js';
import { EditionFiltersDto } from '../dto/edition-filters.dto.js';
import { ScheduleEditionDto } from '../dto/schedule-edition.dto.js';
import { UpdateEditionDto } from '../dto/update-edition.dto.js';
import { Edition } from '../entities/edition.entity.js';
import { Problem } from '../../problems/entities/problem.entity.js';
import { Team } from '../../teams/entities/team.entity.js';
import { ACTIVE_EDITION_STATUSES } from '../../teams/services/teams.service.js';

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
        edition.forbidden_processes = dto.forbidden_processes ?? []
        // Sin valor se queda el default de la columna (reglas activas)
        if(dto.max_monitors !== undefined) edition.max_monitors = dto.max_monitors
        if(dto.watch_usb_storage !== undefined) edition.watch_usb_storage = dto.watch_usb_storage
        if(dto.watch_network !== undefined) edition.watch_network = dto.watch_network

        return this.editionRepository.save(edition)
    }

    async update(id: number, dto: UpdateEditionDto): Promise<IEdition> {
        const edition = await this.getById(id)

        this.assertIsEditable(edition)

        this.editionRepository.merge(edition, dto)

        return this.editionRepository.save(edition)
    }

    // RF-06: solo se programa con problemas publicados y equipos. Se puede reprogramar mientras no inicie
    async schedule(id: number, dto: ScheduleEditionDto): Promise<IEditionScheduleResponse> {
        const edition = await this.getById(id)
        this.assertIsEditable(edition)

        if(dto.scheduled_start.getTime() <= Date.now()){
            throw new BadRequestException('scheduled_start must be in the future')
        }

        const errors = await this.findScheduleErrors(edition)
        if(errors.length > 0){
            throw new ConflictException({ message: 'edition #' + id + ' cannot be scheduled', errors })
        }

        edition.status = EditionStatus.SCHEDULED
        edition.scheduled_start = dto.scheduled_start
        await this.editionRepository.save(edition)

        return { id: edition.id, status: edition.status, scheduled_start: edition.scheduled_start }
    }

    private async findScheduleErrors(edition: Edition): Promise<string[]> {
        const manager = this.editionRepository.manager
        const errors: string[] = []

        if(edition.duration_ms <= 0){
            errors.push('La edición no tiene duración')
        }
        if(!await manager.existsBy(Problem, { edition_id: edition.id, status: ProblemStatus.PUBLISHED })){
            errors.push('La edición no tiene problemas publicados')
        }
        if(!await manager.existsBy(Team, { edition_id: edition.id })){
            errors.push('La edición no tiene equipos')
        }

        // El login de equipos busca el username en todas las ediciones activas: no puede repetirse entre ellas
        const repeated = await manager.createQueryBuilder(Team, 'team')
            .select('team.username', 'username')
            .innerJoin(Team, 'other', 'other.username = team.username AND other.edition_id <> team.edition_id')
            .innerJoin('other.edition', 'otherEdition')
            .where('team.edition_id = :id', { id: edition.id })
            .andWhere('otherEdition.status IN (:...statuses)', { statuses: ACTIVE_EDITION_STATUSES })
            .distinct(true)
            .getRawMany<{ username: string }>()
        if(repeated.length > 0){
            errors.push('Usernames repetidos en otra edición activa: ' + repeated.map((r) => r.username).join(', '))
        }

        return errors
    }

    async remove(id: number): Promise<void> {
        const edition = await this.getById(id)

        if(edition.status !== EditionStatus.DRAFT){
            throw new ConflictException('edition #' + id + ' can only be deleted while it is a draft')
        }

        await this.editionRepository.delete([ id ])
    }

}
