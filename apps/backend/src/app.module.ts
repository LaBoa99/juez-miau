import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { StaffModule } from './staff/staff.module.js';
import { EditionsModule } from './editions/editions.module.js';
import { LanguagesModule } from './languages/languages.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { ContestClockModule } from './contest-clock/contest-clock.module.js';
import { ProblemsModule } from './problems/problems.module.js';
import { TestsetsModule } from './testsets/testsets.module.js';
import { SubmissionsModule } from './submissions/submissions.module.js';
import { JudgingEventsModule } from './judging-events/judging-events.module.js';
import { StandingsModule } from './standings/standings.module.js';
import { IntegrityModule } from './integrity/integrity.module.js';
import { ProctoringModule } from './proctoring/proctoring.module.js';
import { FlagsModule } from './flags/flags.module.js';
import { AuditModule } from './audit/audit.module.js';
import { ExportsModule } from './exports/exports.module.js';
import { PublicModule } from './public/public.module.js';
import { HealthModule } from './health/health.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { buildTypeOrmOptions } from './database/typeorm.config.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildTypeOrmOptions(config),
        autoLoadEntities: true,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: Number(config.getOrThrow<string>('REDIS_PORT')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    AuthModule,
    StaffModule,
    EditionsModule,
    LanguagesModule,
    TeamsModule,
    ContestClockModule,
    ProblemsModule,
    TestsetsModule,
    SubmissionsModule,
    JudgingEventsModule,
    StandingsModule,
    IntegrityModule,
    ProctoringModule,
    FlagsModule,
    AuditModule,
    ExportsModule,
    PublicModule,
    HealthModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
