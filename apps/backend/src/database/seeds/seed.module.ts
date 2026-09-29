import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilsModule } from '../../utils/utils.module.js';
import { buildTypeOrmOptions } from '../typeorm.config.js';

// Módulo mínimo para el seeder: solo BD + utilidades, sin HTTP, Redis ni colas
@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                ...buildTypeOrmOptions(config),
                // No hay forFeature aquí, así que se cargan todas las entidades compiladas
                entities: [join(import.meta.dirname, '..', '..', '**', '*.entity.js')],
            }),
        }),
        UtilsModule,
    ],
})
export class SeedModule {}
