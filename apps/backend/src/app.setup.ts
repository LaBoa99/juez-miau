import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import cookieParser from 'cookie-parser';

// Socket.io con el mismo CORS que HTTP (el decorador del gateway no puede leer la configuración)
class CorsIoAdapter extends IoAdapter {
  constructor(app: INestApplication, private readonly origins: string[] | false) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: this.origins, credentials: true } } as ServerOptions);
  }
}

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);

  app.use(cookieParser());

  // Los casos de prueba pueden pesar varios MB (el input de un caso llega hasta 8 MB serializado)
  (app as NestExpressApplication).useBodyParser('json', { limit: '16mb' });

  // Con credentials: true el origen no puede ser "*"
  const origins = config.get<string>('CORS_ORIGIN')?.split(',').map((o) => o.trim()) ?? false;
  app.enableCors({ origin: origins, credentials: true });
  app.useWebSocketAdapter(new CorsIoAdapter(app, origins));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api/v1');
}
