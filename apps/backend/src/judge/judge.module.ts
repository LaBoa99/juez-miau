import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CpuPool, parseJudgeCpus } from './cpu-pool.js'
import { DockerRunnerService } from './docker-runner.service.js'
import { JudgeService } from './judge.service.js'
import { CPU_POOL } from './judge.constants.js'

// Solo lo importa el worker: necesita docker.sock
@Module({
    providers: [
        DockerRunnerService,
        JudgeService,
        {
            provide: CPU_POOL,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => new CpuPool(parseJudgeCpus(
                config.get<string>('JUDGE_CPUS'),
                Number(config.get<string>('WORKER_CONCURRENCY') ?? 1),
            )),
        },
    ],
    exports: [JudgeService],
})
export class JudgeModule {}
