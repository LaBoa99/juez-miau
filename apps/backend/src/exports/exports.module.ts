import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Problem } from '../problems/entities/problem.entity.js';
import { StandingsModule } from '../standings/standings.module.js';
import { Submission } from '../submissions/entities/submission.entity.js';
import { Team } from '../teams/entities/team.entity.js';
import { ExportsController } from './exports.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Submission, Team, Problem]), StandingsModule],
  controllers: [ExportsController],
})
export class ExportsModule {}
