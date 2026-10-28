import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Problem } from '../problems/entities/problem.entity.js';
import { ProblemsModule } from '../problems/problems.module.js';
import { Team } from '../teams/entities/team.entity.js';
import { ContestController } from './contest.controller.js';
import { ContestService } from './contest.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Team, Problem]), ProblemsModule],
  controllers: [ContestController],
  providers: [ContestService],
})
export class ContestModule {}
