import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { buildTypeOrmOptions } from './typeorm.config.js'

// DataSource para la CLI de TypeORM (migration:generate), migrate.ts y check-migrations.ts.
// Corre sin Nest, así que lee .env por su cuenta; en Docker las variables ya vienen del entorno
try {
    process.loadEnvFile('.env')
} catch {
    // sin .env: se usan las variables del entorno
}

export function createDataSource(database?: string): DataSource {
    return new DataSource({
        ...buildTypeOrmOptions({ get: (key) => process.env[key] }),
        ...(database ? { database } : {}),
        synchronize: false,
        entities: [join(import.meta.dirname, '..', '**', '*.entity.js')],
        migrations: [join(import.meta.dirname, 'migrations', '*.js')],
        migrationsTableName: 'typeorm_migrations',
    })
}

export default createDataSource()
