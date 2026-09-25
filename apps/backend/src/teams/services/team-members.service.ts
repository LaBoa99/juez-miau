import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TeamMember } from "../entities/team-member.entity.js";
import { EntityManager, Repository } from "typeorm";
import { UpdateTeamMemberDto } from "../dtos/update-team-member.dto.js";
import { CreateTeamMemberDto } from "../dtos/create-team-member.dto.js";
import { Team } from "../entities/team.entity.js";

@Injectable()
export class TeamMembersService {

    constructor(
        @InjectRepository(TeamMember)
        private readonly _teamMemberRepository: Repository<TeamMember>
    ) {

    }

    async getById(id: number, manager ?: EntityManager){
        const repository = this.getThreadRepository(manager)
        const teamMember = await repository.findOne({ where: { id }})
        if(!teamMember){
            throw new NotFoundException('team member not found #' + id)
        }

        return teamMember
    }

    async create(team: Team, body: CreateTeamMemberDto, manager ?: EntityManager) {
        const repository = this.getThreadRepository(manager)
        const teamMember = repository.create()

        teamMember.full_name = body.name.toUpperCase().trim()
        teamMember.career = body.career.toUpperCase().trim()
        teamMember.team = team

        return repository.save(teamMember)
    }

    async update(id: number, body: UpdateTeamMemberDto, manager ?: EntityManager) {
        const repository = this.getThreadRepository(manager)
        const teamMember = await this.getById(id, manager)

        repository.merge(teamMember, body)
        
        return repository.save(teamMember)
    }

    private getThreadRepository(manager ?: EntityManager){
        return manager ? manager.getRepository(TeamMember) : this._teamMemberRepository
    }
}