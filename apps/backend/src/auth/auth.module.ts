import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { StaffModule } from '../staff/staff.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { TeamSession } from './entities/team-session.entity.js';
import { EditionStaff } from '../editions/entities/edition-staff.entity.js';
import { Team } from '../teams/entities/team.entity.js';
import { UtilsModule } from '../utils/utils.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';

@Module({
    imports: [
        StaffModule,
        UtilsModule,
        TypeOrmModule.forFeature([RefreshToken, TeamSession, EditionStaff, Team]),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.getOrThrow<string>('JWT_SECRET'),
                signOptions: { expiresIn: '15m' },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService],
})
export class AuthModule {}
