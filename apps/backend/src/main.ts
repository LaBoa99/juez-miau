import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  configureApp(app);
  // HOST=127.0.0.1 deja la API solo en la máquina local; sin HOST escucha en todas las interfaces (Docker)
  await app.listen(process.env.PORT ?? 3000, process.env.HOST);
}
await bootstrap();
