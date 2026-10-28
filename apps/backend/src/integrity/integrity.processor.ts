import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import type { OnApplicationBootstrap } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { IntegrityService } from './integrity.service.js'

export const INTEGRITY_QUEUE = 'integrity'
const CHECK_EVERY_MS = 30_000

// Corre en la API, como el reloj: revisa heartbeats perdidos cada 30 s
@Processor(INTEGRITY_QUEUE)
export class IntegrityProcessor extends WorkerHost implements OnApplicationBootstrap {

    constructor(
        private readonly integrity: IntegrityService,
        @InjectQueue(INTEGRITY_QUEUE)
        private readonly queue: Queue,
    ) {
        super()
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.queue.upsertJobScheduler('heartbeats', { every: CHECK_EVERY_MS }, {
            name: 'heartbeats',
            opts: { removeOnComplete: true, removeOnFail: 100 },
        })
    }

    async process(): Promise<void> {
        await this.integrity.checkHeartbeats()
    }
}
