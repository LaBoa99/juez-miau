import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamsController } from './controllers/teams.controller.js';
import { TeamsService } from './services/teams.service.js';
import { TeamMembersService } from './services/team-members.service.js';
import { TeamSessionsService } from './services/team-sessions.service.js';
import { Team } from './entities/team.entity.js';
import { TeamMember } from './entities/team-member.entity.js';
import { TeamSession } from './entities/team-session.entity.js';
import { UtilsModule } from '../utils/utils.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Team, TeamMember, TeamSession]),
    UtilsModule,
  ],
  controllers: [TeamsController],
  providers: [TeamsService, TeamMembersService, TeamSessionsService],
  exports: [TeamsService],
})
export class TeamsModule {}
