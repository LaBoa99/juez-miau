import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { StaffModule } from '../staff/staff.module.js';
import { UtilsModule } from '../utils/utils.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { EditionsModule } from '../editions/editions.module.js';
import { FlagsModule } from '../flags/flags.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { RefreshTokensService } from './services/refresh-tokens.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { EditionRoleGuard } from './guards/edition-role.guard.js';

@Module({
    imports: [
        StaffModule,
        UtilsModule,
        TeamsModule,
        EditionsModule,
        FlagsModule,
        TypeOrmModule.forFeature([RefreshToken]),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.getOrThrow<string>('JWT_SECRET'),
                signOptions: {
                    expiresIn: (config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m') as JwtSignOptions['expiresIn'],
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        RefreshTokensService,
        // Se ejecutan en este orden: primero autenticación, luego rol en la edición
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: EditionRoleGuard },
    ],
    // Los guards de JWT de otros módulos necesitan JwtService
    exports: [JwtModule],
})
export class AuthModule {}
