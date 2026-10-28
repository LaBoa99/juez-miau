import { join } from 'node:path'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { Redis } from 'ioredis'
import { buildTypeOrmOptions } from '../database/typeorm.config.js'

// Conexiones que comparten la API (AppModule) y el worker (WorkerModule)

export const configImport = ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    envFilePath: '.env',
})

export const bullImport = BullModule.forRootAsync({
    inject: [ConfigService],
    // En ESM BullMQ no puede cargar ioredis por su cuenta: hay que pasarle el cliente ya creado
    useFactory: (config: ConfigService) => ({
        connection: new Redis({
            host: config.getOrThrow<string>('REDIS_HOST'),
            port: Number(config.getOrThrow<string>('REDIS_PORT')),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            maxRetriesPerRequest: null,
        }),
    }),
})

// La API registra las entidades con forFeature y es la única que sincroniza el esquema
export const apiTypeOrmImport = TypeOrmModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
        ...buildTypeOrmOptions(config),
        autoLoadEntities: true,
    }),
})

// El worker carga todas las entidades compiladas (las relaciones apuntan a entidades que no
// registra con forFeature) y nunca sincroniza: si la API y el worker arrancan juntos, chocarían
export const workerTypeOrmImport = TypeOrmModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
        ...buildTypeOrmOptions(config),
        synchronize: false,
        entities: [join(import.meta.dirname, '..', '**', '*.entity.js')],
    }),
})
