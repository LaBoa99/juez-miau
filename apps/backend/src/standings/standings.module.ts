import { TeamsModule } from '../teams/teams.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestClockModule } from '../contest-clock/contest-clock.module.js';
import { Category } from '../editions/entities/category.entity.js';
import { Edition } from '../editions/entities/edition.entity.js';
import { Problem } from '../problems/entities/problem.entity.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { Submission } from '../submissions/entities/submission.entity.js';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { Team } from '../teams/entities/team.entity.js';
import { StandingsController } from './standings.controller.js';
import { StandingsService } from './standings.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Edition, Category, Team, Problem, Submission]),
    SubmissionsModule,
    ContestClockModule,
    RealtimeModule,
    TeamsModule,
  ],
  controllers: [StandingsController],
  providers: [StandingsService],
  exports: [StandingsService],
})
export class StandingsModule {}
