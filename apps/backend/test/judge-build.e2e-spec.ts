import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource, Repository } from 'typeorm';
import { StaffRole, TestsetStatus } from '@concurso/shared-types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { StaffUser } from '../src/staff/entities/staff-user.entity.js';
import { Edition } from '../src/editions/entities/edition.entity.js';
import { Category } from '../src/editions/entities/category.entity.js';
import { EditionStaff } from '../src/editions/entities/edition-staff.entity.js';
import { Language } from '../src/languages/entities/language.entity.js';
import { Problem } from '../src/problems/entities/problem.entity.js';
import { Testset } from '../src/testsets/entities/testset.entity.js';
import { TestCase } from '../src/testsets/entities/test-case.entity.js';
import { BlobsModule } from '../src/blobs/blobs.module.js';
import { BlobsService } from '../src/blobs/services/blobs.service.js';
import { JudgeModule } from '../src/judge/judge.module.js';
import { SubmissionsModule } from '../src/submissions/submissions.module.js';
import { TestsetBuildProcessor } from '../src/testsets/processors/testset-build.processor.js';
import { languageSeeder } from '../src/database/seeds/base/language.seeder.js';

// El processor del worker dentro del mismo proceso que la API (el "modo desarrollo" de
// judge-evaluation.md §6). Ejecuta la solución oficial en Docker, por eso solo corre con JUDGE_DOCKER=1
@Module({
  imports: [TypeOrmModule.forFeature([Testset, TestCase]), BlobsModule, JudgeModule, SubmissionsModule],
  providers: [TestsetBuildProcessor],
})
class InProcessJudgeModule {}

describe.skipIf(!process.env.JUDGE_DOCKER)('Build del testset con la solución oficial en Docker (e2e)', () => {
  let app: INestApplication<App>;
  let testsetRepo: Repository<Testset>;
  let caseRepo: Repository<TestCase>;

  const stamp = Date.now();
  let judge: StaffUser;
  let edition: Edition;
  let python: Language;
  let problemId: number;
  let testsetId: number;
  let token: string;

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const waitForBuild = async (): Promise<Testset> => {
    for (let i = 0; i < 120; i++) {
      const testset = await testsetRepo.findOneByOrFail({ id: testsetId });
      if (testset.status !== TestsetStatus.BUILDING) return testset;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('the build did not finish in 60 s');
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, InProcessJudgeModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    testsetRepo = app.get(getRepositoryToken(Testset));
    caseRepo = app.get(getRepositoryToken(TestCase));
    const staffRepo = app.get<Repository<StaffUser>>(getRepositoryToken(StaffUser));
    const editionRepo = app.get<Repository<Edition>>(getRepositoryToken(Edition));

    // Los lenguajes reales (con Python) del seeder base; es idempotente
    await languageSeeder.run({ manager: app.get(DataSource).manager } as Parameters<typeof languageSeeder.run>[0]);
    python = await app.get<Repository<Language>>(getRepositoryToken(Language)).findOneByOrFail({ code: 'python' });

    judge = await staffRepo.save(staffRepo.create({ name: 'judge', email: `judge-build-${stamp}@concurso.test`, password_hash: 'x' }));
    edition = await editionRepo.save(editionRepo.create({ name: `Judge build E2E ${stamp}` }));
    const category = await app.get<Repository<Category>>(getRepositoryToken(Category)).save({
      edition_id: edition.id, code: 'PRIN', name: 'Principiantes', sort_order: 1,
    });
    await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save({
      edition_id: edition.id, staff_user_id: judge.id, role: StaffRole.JUDGE,
    });
    await editionRepo.createQueryBuilder().relation(Edition, 'languages').of(edition.id).add(python.id);
    token = await app.get(JwtService).signAsync({ sub: judge.id, type: 'staff' });

    const created = await api().post(`/api/v1/editions/${edition.id}/problems`).set(auth()).send({
      categoryId: category.id, title: 'Suma', statement: 'Suma los números y multiplica por k.',
      inputFormat: 'nums: int[], k: long', outputFormat: 'long',
    }).expect(201);
    problemId = created.body.id;
    testsetId = created.body.testsetId;

    await api().patch(`/api/v1/problems/${problemId}/signature`).set(auth()).send({
      functionName: 'sumar',
      params: [{ name: 'nums', type: { type: 'array', items: { type: 'int' } } }, { name: 'k', type: { type: 'long' } }],
      returns: { type: 'long' },
    }).expect(200);
    for (const input of [{ nums: [1, 2, 3], k: '9007199254740993' }, { nums: [], k: 7 }]) {
      await api().post(`/api/v1/testsets/${testsetId}/cases`).set(auth()).send({ input, visibility: 'public' }).expect(201);
    }
  }, 120_000);

  afterAll(async () => {
    await app.get<Repository<Edition>>(getRepositoryToken(Edition)).delete(edition.id);
    await app.get<Repository<StaffUser>>(getRepositoryToken(StaffUser)).delete(judge.id);
    await app.close();
  });

  it('una solución oficial que truena deja el testset FAILED con el motivo', async () => {
    await api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(auth())
      .send({ languageId: python.id, source: 'def sumar(nums, k):\n    raise ValueError("ups")\n' }).expect(200);
    await api().post(`/api/v1/testsets/${testsetId}/build`).set(auth()).expect(202);

    const testset = await waitForBuild();
    expect(testset.status).toBe(TestsetStatus.FAILED);
    expect(testset.build_log).toMatch(/got RE on case #1:[\s\S]*ValueError: ups/);
  }, 90_000);

  it('con una solución correcta queda READY, guarda las salidas y el problema se puede publicar', async () => {
    // Editar un testset FAILED lo regresa a DRAFT
    await api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(auth())
      .send({ languageId: python.id, source: 'def sumar(nums, k):\n    return sum(nums) * k\n' }).expect(200);
    await api().post(`/api/v1/testsets/${testsetId}/build`).set(auth()).expect(202);

    const testset = await waitForBuild();
    expect(testset.status).toBe(TestsetStatus.READY);
    expect(testset.ref_max_time_ms).toEqual(expect.any(Number));
    expect(testset.build_log).toMatch(/^built 2 cases/);

    const cases = await caseRepo.find({ where: { testset_id: testsetId }, order: { ordinal: 'ASC' } });
    const outputs = await app.get(BlobsService).getManyText(cases.map((testCase) => testCase.output_sha!));
    // 6 × (2^53 + 1) no cabe en un double: la salida debe ser exacta
    expect(cases.map((testCase) => outputs.get(testCase.output_sha!))).toEqual(['54043195528445958', '0']);
    expect(cases.every((testCase) => testCase.ref_time_ms !== null)).toBe(true);

    const problem = await app.get<Repository<Problem>>(getRepositoryToken(Problem)).findOneByOrFail({ id: problemId });
    expect(problem.current_testset_id).toBe(testsetId);
    const preview = await api().get(`/api/v1/problems/${problemId}/preview`).set(auth()).expect(200);
    expect(preview.body.samples[0]).toEqual({ input: '{"nums":[1,2,3],"k":9007199254740993}', output: '54043195528445958' });
    await api().post(`/api/v1/problems/${problemId}/propose`).set(auth()).expect(200);
  }, 90_000);
});
