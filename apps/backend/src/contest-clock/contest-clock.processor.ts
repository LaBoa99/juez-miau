import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import type { OnApplicationBootstrap } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { ContestClockService } from './contest-clock.service.js'

export const CONTEST_CLOCK_QUEUE = 'contest-clock'
const TICK_EVERY_MS = 5_000

// Corre en la API: no ejecuta código de participantes. Un solo scheduler aunque haya varias
// instancias de la API (BullMQ lo deduplica por id)
@Processor(CONTEST_CLOCK_QUEUE)
export class ContestClockProcessor extends WorkerHost implements OnApplicationBootstrap {

    constructor(
        private readonly clock: ContestClockService,
        @InjectQueue(CONTEST_CLOCK_QUEUE)
        private readonly queue: Queue,
    ) {
        super()
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.queue.upsertJobScheduler('tick', { every: TICK_EVERY_MS }, {
            name: 'tick',
            opts: { removeOnComplete: true, removeOnFail: 100 },
        })
    }

    async process(): Promise<void> {
        await this.clock.tick()
    }
}
