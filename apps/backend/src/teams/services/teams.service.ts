import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Team } from '../entities/team.entity.js';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { UpdateTeamDto } from '../dtos/update-team.dto.js';
import { TeamMembersService } from './team-members.service.js';
import { PasswordService } from '../../utils/services/password.service.js';
import { Edition } from '../../editions/entities/edition.entity.js';
import { Category } from '../../editions/entities/category.entity.js';
import { CreateTeamDto } from '../dtos/create-team.dto.js';
import { CoolNames } from '../../utils/classes/cool-names.js';
import { Room } from '../../editions/entities/room.entity.js';
import { TeamSessionsService } from './team-sessions.service.js';
import { TeamFiltersDto } from '../dtos/team-filters.dto.js';
import { EditionStatus } from '@concurso/shared-types';

export interface CreateTeamOptions {
    // si no se indican se generan automáticamente
    username?: string
    password?: string
    manager?: EntityManager
}

export const ACTIVE_EDITION_STATUSES = [EditionStatus.SCHEDULED, EditionStatus.RUNNING, EditionStatus.PAUSED]

@Injectable()
export class TeamsService {

    constructor(
        @InjectRepository(Team)
        private readonly _teamRepository: Repository<Team>,
        private readonly _teamMemberService: TeamMembersService,
        private readonly _passwordService: PasswordService,
        private readonly _teamSessionService: TeamSessionsService,
        private readonly _dataSource: DataSource
    ) {

    }

    async getById(id: number, isFull: boolean = false): Promise<Team> {
        const team = await this._teamRepository.findOne({
            where: {
                id
            },
            relations: isFull ? {
                category: true,
                room: true,
                members: true,
                teamSession: true
            } : {}
        })

        if(!team){
            throw new NotFoundException('team not found #' + id)
        }

        return team
    }

    // Devuelve el equipo junto con la contraseña en claro para poder entregarla como credencial
    async create(edition: Edition, category: Category, room: Room | null, dto: CreateTeamDto, options: CreateTeamOptions = {}){
        const repository = options.manager ? options.manager.getRepository(Team) : this._teamRepository
        const team = repository.create()
        const password = options.password ?? this._passwordService.generatePassword(12)

        team.name = dto.name
        team.username = options.username ?? CoolNames.coolUsername(team.name)
        team.password = await this._passwordService.encryptPassword(password)
        team.password_hash = await this._passwordService.hashPassword(password)

        team.edition = edition
        team.category = category
        team.room = room
        team.members = []

        await repository.save(team)

        for(const member of dto.members){
            const temp = await this._teamMemberService.create(team, member, options.manager)
            team.members.push(temp)
        }
        
        return { team, password }
    }

    // Usuario y contraseña en claro para entregar la credencial al equipo.
    // La contraseña se guarda cifrada reversible (master key); aquí se descifra.
    async getCredentials(id: number): Promise<{ username: string, password: string }> {
        const team = await this.getById(id)
        const password = await this._passwordService.decryptPassword(team.password)
        return { username: team.username, password }
    }

    async findAllByEdition(editionId: number, filters: TeamFiltersDto) {
        const query = this._teamRepository.createQueryBuilder('team')
            .leftJoinAndSelect('team.category', 'category')
            .leftJoinAndSelect('team.room', 'room')
            .leftJoinAndSelect('team.members', 'members')
            .leftJoinAndSelect('team.teamSession', 'teamSession')
            .where('team.edition_id = :editionId', { editionId })

        if(filters.categoryId){
            query.andWhere('team.category_id = :categoryId', { categoryId: filters.categoryId })
        }

        if(filters.roomId){
            query.andWhere('team.room_id = :roomId', { roomId: filters.roomId })
        }

        const search = filters.search?.trim()
        if(search){
            query.andWhere(new Brackets((qb) => {
                qb.where('team.name ILIKE :search', { search: `%${search}%` })
                  .orWhere('team.username ILIKE :search', { search: `%${search}%` })
            }))
        }

        const [teams, total] = await query
            .orderBy('team.name', 'ASC')
            .addOrderBy('team.id', 'ASC')
            .skip((filters.page - 1) * filters.pageSize)
            .take(filters.pageSize)
            .getManyAndCount()

        return { teams, total }
    }

    // Usuarios (sin distinguir mayúsculas) que ya están ocupados dentro de la edición
    async findTakenUsernames(editionId: number, usernames: string[]): Promise<Set<string>> {
        if(usernames.length === 0) return new Set()

        const teams = await this._teamRepository.find({
            select: { username: true },
            where: {
                edition_id: editionId,
                username: In(usernames),
            },
        })

        return new Set(teams.map((team) => team.username.toLowerCase()))
    }

    async update(id: number, body: UpdateTeamDto) {
        const team = await this.getById(id)

        const queryRunner = this._dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            Object.assign(team, { name: body.name ?? team.name })
            await queryRunner.manager.save(team)

            // update members
            if(body.members && body.members.length > 0){
                const memberPromises = body.members.map(async (member) => {
                    if(member.id){
                        return this._teamMemberService.update(member.id, member)
                    }
                    return this._teamMemberService.create(team, member as any)
                })

                await Promise.all(memberPromises)
            }

            // las udpate de category y room se deberian hacer en el menu de la edicion...


            await queryRunner.commitTransaction()
            return await this.getById(id)

        } catch (error) {
            await queryRunner.rollbackTransaction()
            throw new InternalServerErrorException('error al actualizar al equipo y sus miembros')
        } finally {
            await queryRunner.release()
        }
    }

    // El username solo es único dentro de su edición; el login lo busca en las ediciones
    // programadas o en curso (al programar una edición se valida que no choque con otra activa)
    async findForLogin(username: string): Promise<Team[]> {
        return this._teamRepository.createQueryBuilder('team')
            .innerJoin('team.edition', 'edition')
            .where('team.username = :username', { username })
            .andWhere('edition.status IN (:...statuses)', { statuses: ACTIVE_EDITION_STATUSES })
            .getMany()
    }

    async resetPassword(id: number) {
        const team = await this.getById(id)

        // Igual que al crear: cifrada (recuperable por el staff) y hasheada (para el login)
        const password = this._passwordService.generatePassword()
        team.password = await this._passwordService.encryptPassword(password)
        team.password_hash = await this._passwordService.hashPassword(password)

        return this._teamRepository.save(team)
    }

    async remove(id: number): Promise<void> {
        await this._teamRepository.delete([ id ])
    }

    async closeSessions(id: number): Promise<void> {
        // valida que el equipo exista antes de cerrar su sesión
        await this.getById(id)
        await this._teamSessionService.revoke(id, 'closed_by_admin')
    }

}
