import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { apiTypeOrmImport, bullImport, configImport } from './core/root-imports.js';
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
import { ContestModule } from './contest/contest.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    configImport,
    // Telemetría de https://observe.nestjs.com, solo con credenciales (OBSERVE_APP_KEY/SECRET).
    // configImport ya cargó el .env en process.env al evaluarse root-imports
    ...(process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
      ? [ObserveModule.forRoot({
          appKey: process.env.OBSERVE_APP_KEY,
          appSecret: process.env.OBSERVE_APP_SECRET,
          serviceId: 'backend',
        })]
      : []),
    apiTypeOrmImport,
    bullImport,
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
    ContestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
