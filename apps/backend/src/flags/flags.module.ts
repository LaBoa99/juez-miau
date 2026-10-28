import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from '../teams/entities/team.entity.js';
import { Flag } from './entities/flag.entity.js';
import { FlagsService } from './flags.service.js';

// Sin controller: las rutas viven en IntegrityModule, que sí puede depender de Auth y Realtime
@Module({
  imports: [TypeOrmModule.forFeature([Flag, Team])],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}
