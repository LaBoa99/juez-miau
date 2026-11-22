import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity.js';
import { AuditController } from './audit.controller.js';
import { NavigationController } from './navigation.controller.js';
import { NavEvent } from './entities/nav-event.entity.js';
import { AuditInterceptor } from './audit.interceptor.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, NavEvent])],
  controllers: [AuditController, NavigationController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AuditModule {}
