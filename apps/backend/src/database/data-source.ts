import { join } from 'node:path'
import { DataSource } from 'typeorm'

// DataSource para la CLI de TypeORM (migration:generate) y para migrate.ts. Corre sin Nest, así
// que lee .env por su cuenta; en Docker las variables ya vienen del entorno
try {
    process.loadEnvFile('.env')
} catch {
    // sin .env: se usan las variables del entorno
}

const required = (name: string): string => {
    const value = process.env[name]
    if(!value) throw new Error(name + ' is not set')
    return value
}

export default new DataSource({
    type: 'postgres',
    host: required('DB_HOST'),
    port: Number(required('DB_PORT')),
    username: required('DB_USERNAME'),
    password: required('DB_PASSWORD'),
    database: required('DB_DATABASE'),
    synchronize: false,
    entities: [join(import.meta.dirname, '..', '**', '*.entity.js')],
    migrations: [join(import.meta.dirname, 'migrations', '*.js')],
    migrationsTableName: 'typeorm_migrations',
})
