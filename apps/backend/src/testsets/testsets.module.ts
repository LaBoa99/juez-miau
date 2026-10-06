import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefSolution } from './entities/ref-solution.entity.js';
import { Generator } from './entities/generator.entity.js';
import { Testset } from './entities/testset.entity.js';
import { TestCase } from './entities/test-case.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefSolution, Generator, Testset, TestCase]),
  ],
  exports: [TypeOrmModule],
})
export class TestsetsModule {}
