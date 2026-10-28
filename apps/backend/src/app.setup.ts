import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);

  app.use(cookieParser());

  // Los casos de prueba pueden pesar varios MB (el input de un caso llega hasta 8 MB serializado)
  (app as NestExpressApplication).useBodyParser('json', { limit: '16mb' });

  // Con credentials: true el origen no puede ser "*"
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',').map((o) => o.trim()) ?? false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api/v1');
}
