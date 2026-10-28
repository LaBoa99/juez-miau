import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Response } from 'express'
import type { Queue } from 'bullmq'
import { DataSource } from 'typeorm'
import { Public } from '../auth/decorators/access.decorators.js'
import { SUBMISSIONS_QUEUE } from '../submissions/submissions.constants.js'

export interface IHealth {
    status: 'ok' | 'error'
    database: 'up' | 'down'
    redis: 'up' | 'down'
    // Informativo: un juez caído no tumba la API, pero los envíos se quedan en cola
    judgeWorkers: number | null
    queuedSubmissions: number | null
}

const TIMEOUT_MS = 3_000

const withTimeout = <T>(promise: Promise<T>) => Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS).unref()),
])

// Para el healthcheck de Docker y para monitoreo: 503 si la BD o Redis no responden
@Controller('health')
export class HealthController {

    constructor(
        private readonly dataSource: DataSource,
        @InjectQueue(SUBMISSIONS_QUEUE)
        private readonly submissions: Queue,
    ) {}

    @Get()
    @Public()
    async check(@Res({ passthrough: true }) res: Response): Promise<IHealth> {
        // Contar los envíos en espera sirve de sonda de Redis (BullMQ 6 no expone el cliente)
        const [database, queuedSubmissions] = await Promise.all([
            withTimeout(this.dataSource.query('SELECT 1')).then(() => 'up' as const, () => 'down' as const),
            withTimeout(this.submissions.getWaitingCount()).catch(() => null),
        ])
        const redis = queuedSubmissions === null ? 'down' : 'up'
        const judgeWorkers = redis === 'up' ? await withTimeout(this.submissions.getWorkersCount()).catch(() => null) : null

        const ok = database === 'up' && redis === 'up'
        if(!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE)
        return { status: ok ? 'ok' : 'error', database, redis, judgeWorkers, queuedSubmissions }
    }
}
