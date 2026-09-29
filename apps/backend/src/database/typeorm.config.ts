import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

// Conexión compartida entre la app (AppModule) y el seeder (SeedModule)
export const buildTypeOrmOptions = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.getOrThrow<string>('DB_HOST'),
  port: Number(config.getOrThrow<string>('DB_PORT')),
  username: config.getOrThrow<string>('DB_USERNAME'),
  password: config.getOrThrow<string>('DB_PASSWORD'),
  database: config.getOrThrow<string>('DB_DATABASE'),
  synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
});
