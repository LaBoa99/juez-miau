import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Problem } from '../problems/entities/problem.entity.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { Team } from '../teams/entities/team.entity.js';
import { ClarificationsController } from './clarifications.controller.js';
import { ClarificationsService } from './clarifications.service.js';
import { Clarification } from './entities/clarification.entity.js';

// Preguntas de los equipos y respuestas del staff durante el concurso
@Module({
  imports: [TypeOrmModule.forFeature([Clarification, Team, Problem]), RealtimeModule],
  controllers: [ClarificationsController],
  providers: [ClarificationsService],
})
export class ClarificationsModule {}
