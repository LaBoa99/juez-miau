import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);

  app.use(cookieParser());

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
