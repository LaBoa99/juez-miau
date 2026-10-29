import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  configureApp(app);
  // HOST=127.0.0.1 deja la API solo en la máquina local; sin HOST escucha en todas las interfaces (Docker)
  const port = process.env.PORT ?? 3000;
  await (process.env.HOST ? app.listen(port, process.env.HOST) : app.listen(port));
}
await bootstrap();
