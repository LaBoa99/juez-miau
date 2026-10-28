import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { WorkerModule } from './worker.module.js'

// node dist/worker.js: mismo código e imagen que la API, otro punto de entrada
async function bootstrap() {
    const app = await NestFactory.createApplicationContext(WorkerModule)
    // docker stop → SIGTERM: BullMQ termina los trabajos activos antes de salir
    app.enableShutdownHooks()
    new Logger('Worker').log('judge worker ready')
}
await bootstrap()
