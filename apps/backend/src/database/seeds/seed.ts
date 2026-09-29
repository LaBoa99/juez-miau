import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PasswordService } from '../../utils/services/password.service.js';
import { SeedModule } from './seed.module.js';
import type { Seeder } from './seeder.interface.js';
import { baseSeeders } from './base/index.js';
import { devSeeders } from './dev/index.js';
import { prodSeeders } from './prod/index.js';

// base siempre va primero: los demás perfiles dependen de él
const PROFILES: Record<string, Seeder[]> = {
    base: baseSeeders,
    dev: [...baseSeeders, ...devSeeders],
    prod: [...baseSeeders, ...prodSeeders],
}

async function seed() {
    const logger = new Logger('Seed')

    // Perfil por argumento (node seed.js dev) o por variable de entorno (SEED_PROFILE=prod)
    const profile = process.argv[2] ?? process.env.SEED_PROFILE ?? 'dev'
    const seeders = PROFILES[profile]
    if (!seeders) {
        throw new Error(`perfil "${profile}" inválido, usa: ${Object.keys(PROFILES).join(', ')}`)
    }

    const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['log', 'error', 'warn'] })
    try {
        const dataSource = app.get(DataSource)
        const config = app.get(ConfigService)
        const passwords = app.get(PasswordService)

        for (const seeder of seeders) {
            logger.log(`corriendo seeder "${seeder.name}"`)
            // Cada seeder en su transacción: si falla a la mitad no deja datos a medias
            await dataSource.transaction((manager) => seeder.run({ manager, config, passwords }))
        }
        logger.log(`perfil "${profile}" terminado`)
    } finally {
        await app.close()
    }
}

await seed()
