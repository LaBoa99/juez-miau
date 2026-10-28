import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { EditionsModule } from '../editions/editions.module.js';
import { FlagsModule } from '../flags/flags.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { TeamSession } from '../teams/entities/team-session.entity.js';
import { Team } from '../teams/entities/team.entity.js';
import { IntegrityController } from './integrity.controller.js';
import { INTEGRITY_QUEUE, IntegrityProcessor } from './integrity.processor.js';
import { IntegrityService } from './integrity.service.js';

// Heartbeat y procesos prohibidos del cliente del concursante, y las alertas que generan
@Module({
  imports: [
    TypeOrmModule.forFeature([Team, TeamSession]),
    BullModule.registerQueue({ name: INTEGRITY_QUEUE }),
    FlagsModule,
    EditionsModule,
    RealtimeModule,
  ],
  controllers: [IntegrityController],
  providers: [IntegrityService, IntegrityProcessor],
  exports: [IntegrityService],
})
export class IntegrityModule {}
