import { Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource, Repository } from 'typeorm';
import { EditionStatus, StaffRole, SubmissionStatus, TestsetStatus, type ISubmission } from '@concurso/shared-types';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { StaffUser } from '../../src/staff/entities/staff-user.entity.js';
import { Edition } from '../../src/editions/entities/edition.entity.js';
import { Category } from '../../src/editions/entities/category.entity.js';
import { EditionStaff } from '../../src/editions/entities/edition-staff.entity.js';
import { Language } from '../../src/languages/entities/language.entity.js';
import { Team } from '../../src/teams/entities/team.entity.js';
import { Testset } from '../../src/testsets/entities/testset.entity.js';
import { TestCase } from '../../src/testsets/entities/test-case.entity.js';
import { Submission } from '../../src/submissions/entities/submission.entity.js';
import { SubmissionCase } from '../../src/submissions/entities/submission-case.entity.js';
import { TeamSessionsService } from '../../src/teams/services/team-sessions.service.js';
import { AccessTokenPayloadFactory } from '../../src/auth/factories/access-token-payload.factory.js';
import { BlobsModule } from '../../src/blobs/blobs.module.js';
import { JudgeModule } from '../../src/judge/judge.module.js';
import { SubmissionsModule } from '../../src/submissions/submissions.module.js';
import { TestsetBuildProcessor } from '../../src/testsets/processors/testset-build.processor.js';
import { SubmissionProcessor } from '../../src/submissions/processors/submission.processor.js';
import { languageSeeder } from '../../src/database/seeds/base/language.seeder.js';

// Los processors del worker dentro del proceso de la API (modo desarrollo)
@Module({
  imports: [TypeOrmModule.forFeature([Testset, TestCase, Submission, SubmissionCase]), BlobsModule, JudgeModule, SubmissionsModule],
  providers: [TestsetBuildProcessor, SubmissionProcessor],
})
export class InProcessJudgeModule {}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitUntil<T>(read: () => Promise<T | undefined> | T | undefined, timeoutMs = 90_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await read();
    if (value !== undefined) return value;
    await sleep(200);
  }
  throw new Error('timed out');
}

export interface ProblemSpec {
  letter: string
  signature: object
  cases: { input: Record<string, unknown>, visibility?: 'public' | 'hidden' }[]
  ref: { language: string, source: string }
  testset?: Record<string, unknown>
}

// Edición RUNNING con un admin, un equipo con sesión y los lenguajes del seeder habilitados
export class ContestFixture {
  app!: INestApplication<App>;
  admin!: StaffUser;
  edition!: Edition;
  category!: Category;
  team!: Team;
  languages!: Record<string, Language>;
  adminToken!: string;
  teamToken!: string;
  private readonly stamp = Date.now() + Math.floor(Math.random() * 1000);

  api = () => request(this.app.getHttpServer());
  asAdmin = () => ({ Authorization: `Bearer ${this.adminToken}` });
  asTeam = () => ({ Authorization: `Bearer ${this.teamToken}` });
  repo = <T extends object>(entity: new () => T) => this.app.get<Repository<T>>(getRepositoryToken(entity));

  async start(name: string): Promise<void> {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule, InProcessJudgeModule] }).compile();
    this.app = moduleFixture.createNestApplication();
    configureApp(this.app);
    await this.app.init();

    await languageSeeder.run({ manager: this.app.get(DataSource).manager } as Parameters<typeof languageSeeder.run>[0]);
    this.languages = Object.fromEntries((await this.repo(Language).find()).map((language) => [language.code, language]));

    this.admin = await this.repo(StaffUser).save({ name: 'admin', email: `${name}-${this.stamp}@concurso.test`, password_hash: 'x' });
    this.edition = await this.repo(Edition).save({ name: `${name} ${this.stamp}`, duration_ms: 3_600_000, freeze_duration_ms: 0 });
    this.category = await this.repo(Category).save({ edition_id: this.edition.id, code: 'PRIN', name: 'Principiantes', sort_order: 1 });
    await this.repo(EditionStaff).save({ edition_id: this.edition.id, staff_user_id: this.admin.id, role: StaffRole.ADMIN });
    for (const language of Object.values(this.languages)) {
      await this.repo(Edition).createQueryBuilder().relation(Edition, 'languages').of(this.edition.id).add(language.id);
    }
    this.team = await this.repo(Team).save({
      edition_id: this.edition.id, category_id: this.category.id, name: 'equipo', username: `${name}-${this.stamp}`, password: 'x', password_hash: 'x',
    });

    const jwt = this.app.get(JwtService);
    const session = await this.app.get(TeamSessionsService).start(this.team.id, 'maquina');
    this.teamToken = await jwt.signAsync({ ...AccessTokenPayloadFactory.forTeam(this.team, session.session.session_id!) });
    this.adminToken = await jwt.signAsync({ ...AccessTokenPayloadFactory.forStaff(this.admin) });
  }

  async stop(): Promise<void> {
    await this.repo(Team).delete({ edition_id: this.edition.id });
    await this.repo(Edition).delete(this.edition.id);
    await this.repo(StaffUser).delete(this.admin.id);
    await this.app.close();
  }

  // Crea el problema, lo construye con la solución oficial y lo publica. Regresa ids
  async publishProblem(spec: ProblemSpec): Promise<{ problemId: number, testsetId: number }> {
    const created = await this.api().post(`/api/v1/editions/${this.edition.id}/problems`).set(this.asAdmin()).send({
      categoryId: this.category.id, letter: spec.letter, title: 'Problema ' + spec.letter, statement: 'Enunciado.',
      inputFormat: 'ver firma', outputFormat: 'ver firma',
    }).expect(201);
    const { id: problemId, testsetId } = created.body;
    await this.api().patch(`/api/v1/problems/${problemId}/signature`).set(this.asAdmin()).send(spec.signature).expect(200);
    if (spec.testset) await this.api().patch(`/api/v1/testsets/${testsetId}`).set(this.asAdmin()).send(spec.testset).expect(200);
    for (const testCase of spec.cases) {
      await this.api().post(`/api/v1/testsets/${testsetId}/cases`).set(this.asAdmin()).send({ visibility: 'public', ...testCase }).expect(201);
    }
    await this.buildTestset(testsetId, spec.ref);
    await this.api().post(`/api/v1/problems/${problemId}/publish`).set(this.asAdmin()).expect(200);
    return { problemId, testsetId };
  }

  async buildTestset(testsetId: number, ref: { language: string, source: string }): Promise<void> {
    await this.api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(this.asAdmin())
      .send({ languageId: this.languages[ref.language].id, source: ref.source }).expect(200);
    await this.api().post(`/api/v1/testsets/${testsetId}/build`).set(this.asAdmin()).expect(202);
    const testset = await waitUntil(async () => {
      const current = await this.repo(Testset).findOneByOrFail({ id: testsetId });
      return current.status === TestsetStatus.BUILDING ? undefined : current;
    });
    if (testset.status !== TestsetStatus.READY) throw new Error('build failed: ' + testset.build_log);
  }

  async run(): Promise<void> {
    await this.repo(Edition).update(this.edition.id, { status: EditionStatus.SCHEDULED, scheduled_start: new Date(Date.now() + 3_600_000) });
    await this.api().post(`/api/v1/editions/${this.edition.id}/clock/start`).set(this.asAdmin()).expect(200);
  }

  // Envía saltándose el cooldown y espera el veredicto
  async submitAndWait(problemId: number, language: string, source: string): Promise<ISubmission> {
    await this.repo(Submission).createQueryBuilder().update()
      .set({ created_at: () => "created_at - interval '1 minute'" }).where('team_id = :id', { id: this.team.id }).execute();
    const res = await this.api().post('/api/v1/submissions').set(this.asTeam())
      .send({ problemId, languageId: this.languages[language].id, source }).expect(202);
    return this.waitJudged(res.body.id);
  }

  async waitJudged(submissionId: number, minRound = 0): Promise<ISubmission> {
    return waitUntil(async () => {
      const submission = await this.repo(Submission).findOneByOrFail({ id: submissionId });
      const done = submission.status === SubmissionStatus.DONE || submission.status === SubmissionStatus.ERROR;
      if (!done || submission.judge_round < minRound) return undefined;
      return (await this.api().get(`/api/v1/submissions/${submissionId}`).set(this.asTeam()).expect(200)).body as ISubmission;
    });
  }
}
