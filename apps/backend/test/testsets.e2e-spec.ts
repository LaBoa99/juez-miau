import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import type { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { StaffRole, TestCaseOrigin, TestsetStatus } from '@concurso/shared-types';
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
import { BlobsService } from '../src/blobs/services/blobs.service.js';
import { TESTSET_BUILD_QUEUE } from '../src/testsets/testsets.constants.js';

describe('Testsets: firma, casos, esquema, solución oficial, build y versiones (e2e)', () => {
  let app: INestApplication<App>;
  let staffRepo: Repository<StaffUser>;
  let editionRepo: Repository<Edition>;
  let languageRepo: Repository<Language>;
  let problemRepo: Repository<Problem>;
  let testsetRepo: Repository<Testset>;
  let caseRepo: Repository<TestCase>;
  let buildQueue: Queue;

  const stamp = Date.now();
  let judge: StaffUser;
  let observer: StaffUser;
  let edition: Edition;
  let enabledLanguage: Language;
  let disabledLanguage: Language;
  let problemId: number;
  let testsetId: number;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  const signature = {
    functionName: 'sumar',
    params: [
      { name: 'nums', type: { type: 'array', items: { type: 'int' } } },
      { name: 'k', type: { type: 'long' } },
    ],
    returns: { type: 'long' },
  };
  const schema = {
    params: {
      nums: { type: 'array', items: { type: 'int', min: -10, max: 10 }, length: [1, 5] },
      k: { type: 'long', min: 0, max: '9000000000000000000' },
    },
    groups: [
      { name: 'chicos', seeds: [1, 2, 3] },
      { name: 'grandes', seeds: [1], overrides: { nums: { length: [1000, 1000], items: { min: -1000000, max: 1000000 } } } },
    ],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    staffRepo = app.get(getRepositoryToken(StaffUser));
    editionRepo = app.get(getRepositoryToken(Edition));
    languageRepo = app.get(getRepositoryToken(Language));
    problemRepo = app.get(getRepositoryToken(Problem));
    testsetRepo = app.get(getRepositoryToken(Testset));
    caseRepo = app.get(getRepositoryToken(TestCase));
    buildQueue = app.get(getQueueToken(TESTSET_BUILD_QUEUE));
    const jwt = app.get(JwtService);

    const newStaff = (name: string) =>
      staffRepo.save(staffRepo.create({ name, email: `testsets-${name}-${stamp}@concurso.test`, password_hash: 'x' }));
    judge = await newStaff('judge');
    observer = await newStaff('observer');

    edition = await editionRepo.save(editionRepo.create({ name: `Testsets E2E ${stamp}` }));
    const category = await app.get<Repository<Category>>(getRepositoryToken(Category)).save({
      edition_id: edition.id, code: 'PRIN', name: 'Principiantes', sort_order: 1,
    });
    await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save([
      { edition_id: edition.id, staff_user_id: judge.id, role: StaffRole.JUDGE },
      { edition_id: edition.id, staff_user_id: observer.id, role: StaffRole.OBSERVER },
    ]);

    const newLanguage = (suffix: string, ext: string) =>
      languageRepo.save(languageRepo.create({
        code: `testsets-${suffix}-${stamp}`, image_ref: 'img', compile_cmd: '', run_cmd: 'run', compiler_version: '1', file_ext: ext,
      }));
    enabledLanguage = await newLanguage('on', 'x' + String(stamp % 1000).padStart(3, '0'));
    disabledLanguage = await newLanguage('off', 'y' + String(stamp % 1000).padStart(3, '0'));
    await editionRepo.createQueryBuilder().relation(Edition, 'languages').of(edition.id).add(enabledLanguage.id);

    for (const user of [judge, observer]) {
      tokens[user.name] = await jwt.signAsync({ sub: user.id, type: 'staff' });
    }

    const created = await api().post(`/api/v1/editions/${edition.id}/problems`).set(as('judge')).send({
      categoryId: category.id,
      letter: 'A',
      title: 'Suma',
      statement: 'Suma los números y agrega k.',
      inputFormat: 'nums: int[], k: long',
      outputFormat: 'long',
    }).expect(201);
    problemId = created.body.id;
    testsetId = created.body.testsetId;
  });

  afterAll(async () => {
    const jobs = await buildQueue.getJobs(['waiting', 'delayed', 'prioritized']);
    await Promise.all(jobs.filter((job) => job.data.testsetId === testsetId).map((job) => job.remove()));

    // El CASCADE de la edición borra problemas, testsets, casos y soluciones. Los blobs se quedan:
    // son contenido compartido por sha
    await editionRepo.delete(edition.id);
    await languageRepo.delete([enabledLanguage.id, disabledLanguage.id]);
    await staffRepo.delete([judge.id, observer.id]);
    await app.close();
  });

  it('el testset v1 nace en draft y sin firma no se pueden capturar casos', async () => {
    const res = await api().get(`/api/v1/testsets/${testsetId}`).set(as('judge')).expect(200);
    expect(res.body).toMatchObject({ id: testsetId, problemId, version: 1, status: 'draft', compareMode: 'exact', cases: [] });

    const noSignature = await api().post(`/api/v1/testsets/${testsetId}/cases`).set(as('judge')).send({ input: { nums: [1] } }).expect(422);
    expect(noSignature.body.errors).toEqual([expect.stringContaining('has no signature')]);
  });

  it('el observador no puede ver ni editar testsets', async () => {
    await api().get(`/api/v1/testsets/${testsetId}`).set(as('observer')).expect(403);
    await api().patch(`/api/v1/problems/${problemId}/signature`).set(as('observer')).send(signature).expect(403);
  });

  it('PATCH /problems/:id/signature valida y guarda la firma', async () => {
    const invalid = await api().patch(`/api/v1/problems/${problemId}/signature`).set(as('judge'))
      .send({ ...signature, functionName: 'class' }).expect(422);
    expect(invalid.body.errors).toEqual([expect.stringContaining('reserved word')]);

    const res = await api().patch(`/api/v1/problems/${problemId}/signature`).set(as('judge')).send(signature).expect(200);
    expect(res.body.signature).toEqual(signature);
  });

  it('POST /testsets/:id/cases valida el input contra la firma y lo guarda en canónico', async () => {
    const invalid = await api().post(`/api/v1/testsets/${testsetId}/cases`).set(as('judge'))
      .send({ input: { nums: [1, 'dos'], extra: true } }).expect(422);
    expect(invalid.body.errors).toEqual(expect.arrayContaining([
      'input.extra: not a parameter of sumar',
      'input.nums[1]: expected int (32 bits)',
      'input.k: missing',
    ]));

    const res = await api().post(`/api/v1/testsets/${testsetId}/cases`).set(as('judge'))
      .send({ input: { k: '9007199254740993', nums: [1, 2, 3] }, visibility: 'public' }).expect(201);
    expect(res.body).toMatchObject({
      ordinal: 1,
      visibility: 'public',
      origin: 'manual',
      outputSha: null,
      inputPreview: '{"nums":[1,2,3],"k":9007199254740993}',
    });

    const content = await api().get(`/api/v1/testsets/${testsetId}/cases/${res.body.id}`).set(as('judge')).expect(200);
    expect(content.body).toEqual({ id: res.body.id, input: '{"nums":[1,2,3],"k":9007199254740993}', output: null });
  });

  it('cambiar la firma a una incompatible con los casos da 422', async () => {
    const res = await api().patch(`/api/v1/problems/${problemId}/signature`).set(as('judge')).send({
      ...signature,
      params: [{ name: 'nums', type: { type: 'array', items: { type: 'string' } } }],
    }).expect(422);

    expect(res.body.errors).toEqual(expect.arrayContaining([
      'case #1 input.k: not a parameter of sumar',
      'case #1 input.nums[0]: expected string',
    ]));
  });

  it('PATCH /testsets/:id valida el esquema y POST generate crea los casos', async () => {
    const invalid = await api().patch(`/api/v1/testsets/${testsetId}`).set(as('judge'))
      .send({ schema: { ...schema, params: { nums: schema.params.nums } } }).expect(422);
    expect(invalid.body.errors).toEqual(['schema.params.k: missing']);

    const updated = await api().patch(`/api/v1/testsets/${testsetId}`).set(as('judge'))
      .send({ schema, timeLimitMs: 2000, compareMode: 'tolerance' }).expect(200);
    expect(updated.body).toMatchObject({ timeLimitMs: 2000, compareMode: 'tolerance', floatTolerance: 1e-6, schema });

    const first = await api().post(`/api/v1/testsets/${testsetId}/generate`).set(as('judge')).expect(200);
    expect(first.body).toEqual({ generatedCount: 4 });
    const firstShas = (await caseRepo.find({ where: { testset_id: testsetId, origin: TestCaseOrigin.GENERATED }, order: { ordinal: 'ASC' }}))
      .map((testCase) => testCase.input_sha);

    // Regenerar reemplaza los casos generados con los mismos datos y conserva los manuales
    await api().post(`/api/v1/testsets/${testsetId}/generate`).set(as('judge')).expect(200);
    const detail = await api().get(`/api/v1/testsets/${testsetId}`).set(as('judge')).expect(200);
    expect(detail.body.generatedCount).toBe(4);
    expect(detail.body.cases.map((c: { ordinal: number, origin: string, group: string | null, seed: number | null }) => [c.ordinal, c.origin, c.group, c.seed]))
      .toEqual([[1, 'manual', null, null], [2, 'generated', 'chicos', 1], [3, 'generated', 'chicos', 2], [4, 'generated', 'chicos', 3], [5, 'generated', 'grandes', 1]]);
    expect(detail.body.cases.slice(1).map((c: { inputSha: string }) => c.inputSha)).toEqual(firstShas);

    const blobs = app.get(BlobsService);
    const big = JSON.parse(await blobs.getText(firstShas[3]));
    expect(big.nums).toHaveLength(1000);
  });

  it('un caso generado solo cambia de visibilidad; su input no se edita', async () => {
    const generated = await caseRepo.findOneByOrFail({ testset_id: testsetId, ordinal: 2 });
    await api().patch(`/api/v1/testsets/${testsetId}/cases/${generated.id}`).set(as('judge')).send({ input: { nums: [1], k: 1 } }).expect(409);
    const res = await api().patch(`/api/v1/testsets/${testsetId}/cases/${generated.id}`).set(as('judge')).send({ visibility: 'public' }).expect(200);
    expect(res.body.visibility).toBe('public');
  });

  it('PUT /testsets/:id/ref-solution exige un lenguaje habilitado en la edición', async () => {
    await api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(as('judge'))
      .send({ languageId: disabledLanguage.id, source: 'def sumar(nums, k): return sum(nums) + k' }).expect(422);

    const res = await api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(as('judge'))
      .send({ languageId: enabledLanguage.id, source: 'def sumar(nums, k): return sum(nums) + k' }).expect(200);
    expect(res.body).toMatchObject({ languageId: enabledLanguage.id, createdBy: judge.id, sourceSha: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it('POST /testsets/:id/build lo deja en building, lo encola y bloquea la edición', async () => {
    const res = await api().post(`/api/v1/testsets/${testsetId}/build`).set(as('judge')).expect(202);
    expect(res.body).toEqual({ id: testsetId, problemId, version: 1, status: 'building' });

    const jobs = await buildQueue.getJobs(['waiting', 'delayed', 'prioritized', 'active']);
    expect(jobs.some((job) => job.data.testsetId === testsetId)).toBe(true);

    await api().post(`/api/v1/testsets/${testsetId}/build`).set(as('judge')).expect(409);
    await api().patch(`/api/v1/testsets/${testsetId}`).set(as('judge')).send({ timeLimitMs: 1000 }).expect(409);
    await api().post(`/api/v1/testsets/${testsetId}/cases`).set(as('judge')).send({ input: { nums: [1], k: 1 } }).expect(409);
  });

  it('POST /problems/:id/testsets solo desde un testset ready; clona la v2 en draft con los mismos sha', async () => {
    await api().post(`/api/v1/problems/${problemId}/testsets`).set(as('judge')).send({ reason: 'antes de tiempo' }).expect(409);

    // Simula lo que hará el build de la fase 3
    const blobs = app.get(BlobsService);
    const output = await blobs.put('6');
    await caseRepo.update({ testset_id: testsetId }, { output_sha: output.sha, output_bytes: output.size });
    await testsetRepo.update(testsetId, { status: TestsetStatus.READY });

    const res = await api().post(`/api/v1/problems/${problemId}/testsets`).set(as('judge')).send({ reason: 'faltaba un caso límite' }).expect(201);
    expect(res.body).toMatchObject({ problemId, version: 2, status: 'draft' });

    const v1Cases = await caseRepo.find({ where: { testset_id: testsetId }, order: { ordinal: 'ASC' }});
    const v2Cases = await caseRepo.find({ where: { testset_id: res.body.id }, order: { ordinal: 'ASC' }});
    expect(v2Cases.map((c) => [c.ordinal, c.input_sha, c.output_sha])).toEqual(v1Cases.map((c) => [c.ordinal, c.input_sha, c.output_sha]));

    const v2 = await testsetRepo.findOneByOrFail({ id: res.body.id });
    expect(v2).toMatchObject({ reason: 'faltaba un caso límite', time_limit_ms: 2000, schema, author_id: judge.id });

    // El problema sigue usando la v1 y la v1 ya no se edita
    expect((await problemRepo.findOneByOrFail({ id: problemId })).current_testset_id).toBe(testsetId);
    await api().patch(`/api/v1/testsets/${testsetId}`).set(as('judge')).send({ timeLimitMs: 1000 }).expect(409);
    // Solo una versión en curso a la vez
    await api().post(`/api/v1/problems/${problemId}/testsets`).set(as('judge')).send({ reason: 'otra' }).expect(409);
  });

  it('el preview muestra los casos públicos con salida y publicar ya no tiene errores de testset', async () => {
    const preview = await api().get(`/api/v1/problems/${problemId}/preview`).set(as('judge')).expect(200);
    expect(preview.body.signature).toEqual(signature);
    expect(preview.body.samples).toHaveLength(2);
    expect(preview.body.samples[0]).toEqual({ input: '{"nums":[1,2,3],"k":9007199254740993}', output: '6' });

    await api().post(`/api/v1/problems/${problemId}/publish`).set(as('judge')).expect(200);
    // Con el problema publicado la firma ya no cambia
    await api().patch(`/api/v1/problems/${problemId}/signature`).set(as('judge')).send(signature).expect(409);
  });
});
