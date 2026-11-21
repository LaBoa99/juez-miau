import { Logger } from '@nestjs/common';
import { Edition } from '../../../editions/entities/edition.entity.js';
import { Room } from '../../../editions/entities/room.entity.js';
import { Category } from '../../../editions/entities/category.entity.js';
import type { Seeder } from '../seeder.interface.js';
import { DEMO_CATEGORIES, DEMO_EDITION } from './constants.js';

const logger = new Logger('DevRoomSeeder')

// Depende de: dev/edition
export const devRoomSeeder: Seeder = {
    name: 'dev/room',
    async run({ manager }) {
        const edition = await manager.findOneByOrFail(Edition, { name: DEMO_EDITION })

        for (const { code, room } of DEMO_CATEGORIES) {
            if (await manager.existsBy(Room, { edition_id: edition.id, name: room })) continue

            // Cada salón con su categoría: los equipos del seed caen en él sin indicarlo
            const category = await manager.findOneByOrFail(Category, { edition_id: edition.id, code })
            await manager.save(Room, { edition_id: edition.id, name: room, categories: [category] })
            logger.log(`${room} creado`)
        }
    },
}
