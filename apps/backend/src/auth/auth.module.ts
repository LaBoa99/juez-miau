import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { TeamSession } from './entities/team-session.entity.js';
import { EditionStaff } from '../editions/entities/edition-staff.entity.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';

@Module({
    imports: [
        StaffModule,
        TypeOrmModule.forFeature([RefreshToken, TeamSession, EditionStaff]),
    ],
    controllers: [AuthController],
    providers: [AuthService],
})
export class AuthModule {}
