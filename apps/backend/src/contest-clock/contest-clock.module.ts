import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Edition } from '../editions/entities/edition.entity.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ContestClockController } from './contest-clock.controller.js';
import { ContestClockService } from './contest-clock.service.js';
import { CONTEST_CLOCK_QUEUE, ContestClockProcessor } from './contest-clock.processor.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Edition]),
    BullModule.registerQueue({ name: CONTEST_CLOCK_QUEUE }),
    RealtimeModule,
  ],
  controllers: [ContestClockController],
  providers: [ContestClockService, ContestClockProcessor],
  exports: [ContestClockService],
})
export class ContestClockModule {}
