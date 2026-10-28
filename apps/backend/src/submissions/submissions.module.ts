import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Edition } from '../editions/entities/edition.entity.js';
import { EditionsModule } from '../editions/editions.module.js';
import { Language } from '../languages/entities/language.entity.js';
import { Problem } from '../problems/entities/problem.entity.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { Team } from '../teams/entities/team.entity.js';
import { SubmissionsController } from './controllers/submissions.controller.js';
import { Submission } from './entities/submission.entity.js';
import { SubmissionCase } from './entities/submission-case.entity.js';
import { SubmissionsService } from './services/submissions.service.js';
import { SUBMISSIONS_QUEUE } from './submissions.constants.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Submission, SubmissionCase, Team, Problem, Language, Edition]),
    // Aquí solo se encolan envíos; el consumidor vive en el worker
    BullModule.registerQueue({ name: SUBMISSIONS_QUEUE }),
    EditionsModule,
    RealtimeModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [TypeOrmModule, SubmissionsService],
})
export class SubmissionsModule {}
