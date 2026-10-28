import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { SUBMISSIONS_QUEUE } from '../submissions/submissions.constants.js';
import { JudgingEventsListener } from './judging-events.listener.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: SUBMISSIONS_QUEUE }),
    SubmissionsModule,
    RealtimeModule,
  ],
  providers: [JudgingEventsListener],
  exports: [JudgingEventsListener],
})
export class JudgingEventsModule {}
