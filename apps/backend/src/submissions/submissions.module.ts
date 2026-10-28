import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Edition } from '../editions/entities/edition.entity.js';
import { EditionsModule } from '../editions/editions.module.js';
import { FlagsModule } from '../flags/flags.module.js';
import { Language } from '../languages/entities/language.entity.js';
import { Problem } from '../problems/entities/problem.entity.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { Team } from '../teams/entities/team.entity.js';
import { SubmissionsController } from './controllers/submissions.controller.js';
import { Submission } from './entities/submission.entity.js';
import { SubmissionCase } from './entities/submission-case.entity.js';
import { SubmissionHistory } from './entities/submission-history.entity.js';
import { SubmissionQueueService } from './services/submission-queue.service.js';
import { SubmissionsService } from './services/submissions.service.js';
import { SUBMISSIONS_QUEUE } from './submissions.constants.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Submission, SubmissionCase, SubmissionHistory, Team, Problem, Language, Edition]),
    // Aquí solo se encolan envíos; el consumidor vive en el worker
    BullModule.registerQueue({ name: SUBMISSIONS_QUEUE }),
    EditionsModule,
    FlagsModule,
    RealtimeModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionQueueService],
  exports: [TypeOrmModule, SubmissionsService, SubmissionQueueService],
})
export class SubmissionsModule {}
