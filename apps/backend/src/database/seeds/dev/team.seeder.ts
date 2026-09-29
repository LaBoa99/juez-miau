import { Logger } from '@nestjs/common';
import { faker } from '@faker-js/faker/locale/es_MX';
import { Category } from '../../../editions/entities/category.entity.js';
import { Edition } from '../../../editions/entities/edition.entity.js';
import { Room } from '../../../editions/entities/room.entity.js';
import { Team } from '../../../teams/entities/team.entity.js';
import { makeTeam } from '../factories/team.factory.js';
import type { Seeder } from '../seeder.interface.js';
import { DEMO_CATEGORIES, DEMO_EDITION, DEV_PASSWORD, TEAMS_PER_CATEGORY } from './constants.js';

const logger = new Logger('DevTeamSeeder')

// Depende de: dev/edition, dev/category, dev/room
export const devTeamSeeder: Seeder = {
    name: 'dev/team',
    async run({ manager, passwords }) {
        const edition = await manager.findOneByOrFail(Edition, { name: DEMO_EDITION })
        if (await manager.existsBy(Team, { edition_id: edition.id })) return

        // Semilla fija: cada corrida genera exactamente los mismos nombres
        faker.seed(2026)

        // Todos comparten DEV_PASSWORD para poder entrar como cualquiera (equipo01, equipo02, ...)
        const password = await passwords.encryptPassword(DEV_PASSWORD)
        const password_hash = await passwords.hashPassword(DEV_PASSWORD)

        let n = 0
        for (const { code, room: roomName } of DEMO_CATEGORIES) {
            const category = await manager.findOneByOrFail(Category, { edition_id: edition.id, code })
            const room = await manager.findOneByOrFail(Room, { edition_id: edition.id, name: roomName })

            await manager.insert(Team, Array.from({ length: TEAMS_PER_CATEGORY }, () => makeTeam({
                edition_id: edition.id,
                category_id: category.id,
                room_id: room.id,
                username: `equipo${String(++n).padStart(2, '0')}`,
                password,
                password_hash,
            })))
        }
        logger.log(`${n} equipos creados`)
    },
}
