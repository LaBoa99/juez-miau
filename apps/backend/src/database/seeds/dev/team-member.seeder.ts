import { Logger } from '@nestjs/common';
import { faker } from '@faker-js/faker/locale/es_MX';
import { Edition } from '../../../editions/entities/edition.entity.js';
import { Team } from '../../../teams/entities/team.entity.js';
import { TeamMember } from '../../../teams/entities/team-member.entity.js';
import { makeTeamMember } from '../factories/team.factory.js';
import type { Seeder } from '../seeder.interface.js';
import { DEMO_EDITION, MEMBERS_PER_TEAM } from './constants.js';

const logger = new Logger('DevTeamMemberSeeder')

// Depende de: dev/team
export const devTeamMemberSeeder: Seeder = {
    name: 'dev/team-member',
    async run({ manager }) {
        const edition = await manager.findOneByOrFail(Edition, { name: DEMO_EDITION })
        const teams = await manager.find(Team, {
            where: { edition_id: edition.id },
            relations: { members: true },
            order: { username: 'ASC' },
        })

        faker.seed(2027)
        const members = teams
            .filter((team) => team.members.length === 0)
            .flatMap((team) => Array.from({ length: MEMBERS_PER_TEAM }, () => makeTeamMember({ team_id: team.id })))

        if (members.length === 0) return
        await manager.insert(TeamMember, members)
        logger.log(`${members.length} integrantes creados`)
    },
}
