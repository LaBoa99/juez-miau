import { Logger } from '@nestjs/common';
import { Category } from '../../../editions/entities/category.entity.js';
import { Edition } from '../../../editions/entities/edition.entity.js';
import type { Seeder } from '../seeder.interface.js';
import { DEMO_CATEGORIES, DEMO_EDITION } from './constants.js';

const logger = new Logger('DevCategorySeeder')

// Depende de: dev/edition
export const devCategorySeeder: Seeder = {
    name: 'dev/category',
    async run({ manager }) {
        // La relación se resuelve buscando al padre por su llave natural, no pasando ids entre seeders
        const edition = await manager.findOneByOrFail(Edition, { name: DEMO_EDITION })

        for (const { code, name, sort_order } of DEMO_CATEGORIES) {
            if (await manager.existsBy(Category, { edition_id: edition.id, code })) continue
            await manager.insert(Category, { edition_id: edition.id, code, name, sort_order })
            logger.log(`categoría ${code} creada`)
        }
    },
}
