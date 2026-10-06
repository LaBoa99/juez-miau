import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { EditionsModule } from '../editions/editions.module.js';
import { TestsetsModule } from '../testsets/testsets.module.js';
import { EditionProblemsController } from './controllers/edition-problems.controller.js';
import { ProblemsController } from './controllers/problems.controller.js';
import { ProblemsService } from './services/problems.service.js';
import { Problem } from './entities/problem.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Problem]),
    AuthModule,
    EditionsModule,
    TestsetsModule,
  ],
  controllers: [EditionProblemsController, ProblemsController],
  providers: [ProblemsService],
  exports: [ProblemsService],
})
export class ProblemsModule {}
