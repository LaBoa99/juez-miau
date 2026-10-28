import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SUBMISSIONS_QUEUE } from '../submissions/submissions.constants.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [BullModule.registerQueue({ name: SUBMISSIONS_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
