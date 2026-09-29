import { Logger } from '@nestjs/common';
import { Edition } from '../../../editions/entities/edition.entity.js';
import type { Seeder } from '../seeder.interface.js';
import { DEMO_EDITION } from './constants.js';

const logger = new Logger('DevEditionSeeder')

export const devEditionSeeder: Seeder = {
    name: 'dev/edition',
    async run({ manager }) {
        if (await manager.existsBy(Edition, { name: DEMO_EDITION })) return

        await manager.insert(Edition, {
            name: DEMO_EDITION,
            duration_ms: 5 * 60 * 60 * 1000,
            freeze_duration_ms: 60 * 60 * 1000,
        })
        logger.log(`"${DEMO_EDITION}" creada`)
    },
}
