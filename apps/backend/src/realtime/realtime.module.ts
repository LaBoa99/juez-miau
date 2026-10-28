import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EditionsModule } from '../editions/editions.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [AuthModule, EditionsModule, TeamsModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
