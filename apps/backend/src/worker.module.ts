import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { bullImport, configImport, workerTypeOrmImport } from './core/root-imports.js'
import { BlobsModule } from './blobs/blobs.module.js'
import { JudgeModule } from './judge/judge.module.js'
import { Testset } from './testsets/entities/testset.entity.js'
import { TestCase } from './testsets/entities/test-case.entity.js'
import { TestsetBuildProcessor } from './testsets/processors/testset-build.processor.js'
import { TESTSET_BUILD_QUEUE } from './testsets/testsets.constants.js'

// Proceso del juez (judge-evaluation.md §6): sin HTTP, consume las colas y ejecuta en Docker.
// Es el único con acceso a docker.sock; la API solo encola
@Module({
    imports: [
        configImport,
        workerTypeOrmImport,
        bullImport,
        TypeOrmModule.forFeature([Testset, TestCase]),
        BullModule.registerQueue({ name: TESTSET_BUILD_QUEUE }),
        BlobsModule,
        JudgeModule,
    ],
    providers: [TestsetBuildProcessor],
})
export class WorkerModule {}
