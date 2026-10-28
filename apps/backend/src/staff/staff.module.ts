import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffUser } from './entities/staff-user.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { StaffController } from './controllers/staff.controller.js';
import { StaffService } from './services/staff.service.js';
import { UtilsModule } from '../utils/utils.module.js';

@Module({
    imports: [TypeOrmModule.forFeature([StaffUser, RefreshToken]), UtilsModule],
    controllers: [StaffController],
    providers: [StaffService],
    exports: [StaffService],
})
export class StaffModule {}
