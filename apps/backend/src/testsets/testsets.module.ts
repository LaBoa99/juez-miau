import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BlobsModule } from '../blobs/blobs.module.js';
import { EditionsModule } from '../editions/editions.module.js';
import { Problem } from '../problems/entities/problem.entity.js';
import { RefSolution } from './entities/ref-solution.entity.js';
import { Generator } from './entities/generator.entity.js';
import { Testset } from './entities/testset.entity.js';
import { TestCase } from './entities/test-case.entity.js';
import { TestsetsService } from './services/testsets.service.js';
import { TestsetsController } from './controllers/testsets.controller.js';
import { ProblemTestsetsController } from './controllers/problem-testsets.controller.js';
import { TESTSET_BUILD_QUEUE } from './testsets.constants.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefSolution, Generator, Testset, TestCase, Problem]),
    // Aquí solo se encolan builds; el consumidor vive en el worker
    BullModule.registerQueue({ name: TESTSET_BUILD_QUEUE }),
    BlobsModule,
    EditionsModule,
  ],
  controllers: [TestsetsController, ProblemTestsetsController],
  providers: [TestsetsService],
  exports: [TypeOrmModule, BlobsModule, TestsetsService],
})
export class TestsetsModule {}
