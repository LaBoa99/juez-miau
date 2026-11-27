import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import type { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { ProblemStatus, StaffRole, TestCaseOrigin, TestCaseVisibility, TestsetStatus } from '@concurso/shared-types';
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
import { languageSeeder } from '../src/database/seeds/base/language.seeder.js';

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
  let colleague: StaffUser;
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
    colleague = await newStaff('colleague');

    edition = await editionRepo.save(editionRepo.create({ name: `Testsets E2E ${stamp}` }));
    const category = await app.get<Repository<Category>>(getRepositoryToken(Category)).save({
      edition_id: edition.id, code: 'PRIN', name: 'Principiantes', sort_order: 1,
    });
    await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save([
      { edition_id: edition.id, staff_user_id: judge.id, role: StaffRole.JUDGE },
      { edition_id: edition.id, staff_user_id: observer.id, role: StaffRole.OBSERVER },
      { edition_id: edition.id, staff_user_id: colleague.id, role: StaffRole.JUDGE },
    ]);

    const newLanguage = (suffix: string, ext: string) =>
      languageRepo.save(languageRepo.create({
        code: `testsets-${suffix}-${stamp}`, image_ref: 'img', compile_cmd: '', run_cmd: 'run', compiler_version: '1', file_ext: ext,
      }));
    // La solución oficial necesita un lenguaje con driver: Python del seeder base (idempotente)
    await languageSeeder.run({ manager: languageRepo.manager } as Parameters<typeof languageSeeder.run>[0]);
    enabledLanguage = await languageRepo.findOneByOrFail({ code: 'python' });
    disabledLanguage = await newLanguage('off', 'y' + String(stamp % 1000).padStart(3, '0'));
    await editionRepo.createQueryBuilder().relation(Edition, 'languages').of(edition.id).add(enabledLanguage.id);

    for (const user of [judge, observer, colleague]) {
      tokens[user.name] = await jwt.signAsync({ sub: user.id, type: 'staff' });
    }

    const created = await api().post(`/api/v1/editions/${edition.id}/problems`).set(as('judge')).send({
      categoryId: category.id,
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
    await languageRepo.delete([disabledLanguage.id]);
    await staffRepo.delete([judge.id, observer.id, colleague.id]);
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

  it('generar con esquema conserva la visibilidad por grupo y semilla; PATCH cases/visibility cambia un grupo', async () => {
    await api().post(`/api/v1/testsets/${testsetId}/generate`).set(as('judge')).send({ schema }).expect(200);
    const visibility = async () => (await caseRepo.find({ where: { testset_id: testsetId }, order: { ordinal: 'ASC' } }))
      .map((testCase) => [testCase.group_name, testCase.seed, testCase.visibility]);
    expect((await visibility()).filter(([group]) => group === 'chicos')).toEqual([['chicos', 1, 'public'], ['chicos', 2, 'hidden'], ['chicos', 3, 'hidden']]);

    const res = await api().patch(`/api/v1/testsets/${testsetId}/cases/visibility`).set(as('judge'))
      .send({ group: 'grandes', visibility: 'public' }).expect(200);
    expect(res.body).toEqual({ updated: 1 });
    expect((await visibility()).find(([group]) => group === 'grandes')).toEqual(['grandes', 1, 'public']);

    await api().patch(`/api/v1/testsets/${testsetId}/cases/visibility`).set(as('observer')).send({ group: 'grandes', visibility: 'hidden' }).expect(403);
    await api().patch(`/api/v1/testsets/${testsetId}/cases/visibility`).set(as('judge')).send({ group: 'grandes', visibility: 'hidden' }).expect(200);
  });

  it('POST cases/bulk agrega todos o ninguno; POST cases/:id/pin vuelve manual un caso generado', async () => {
    const before = await caseRepo.countBy({ testset_id: testsetId });
    const invalid = await api().post(`/api/v1/testsets/${testsetId}/cases/bulk`).set(as('judge'))
      .send({ cases: [{ input: { nums: [1], k: 1 } }, { input: { nums: 'x', k: 1 } }] }).expect(422);
    expect(invalid.body.errors[0]).toMatch(/^case 2: /);
    expect(await caseRepo.countBy({ testset_id: testsetId })).toBe(before);

    const added = await api().post(`/api/v1/testsets/${testsetId}/cases/bulk`).set(as('judge'))
      .send({ cases: [{ input: { nums: [1], k: 1 }, group: ' bordes ' }, { input: { nums: [2, 3], k: 0 }, visibility: 'hidden', group: 'bordes' }] }).expect(201);
    expect(added.body.map((c: { ordinal: number, origin: string, group: string | null }) => [c.ordinal, c.origin, c.group]))
      .toEqual([[before + 1, 'manual', 'bordes'], [before + 2, 'manual', 'bordes']]);
    // Un grupo manual se hace público de una vez, igual que uno aleatorio
    const grouped = await api().patch(`/api/v1/testsets/${testsetId}/cases/visibility`).set(as('judge')).send({ group: 'bordes', visibility: 'public' }).expect(200);
    expect(grouped.body).toEqual({ updated: 2 });
    const moved = await api().patch(`/api/v1/testsets/${testsetId}/cases/${added.body[0].id}`).set(as('judge')).send({ group: null }).expect(200);
    expect(moved.body.group).toBeNull();

    const generated = await caseRepo.findOneByOrFail({ testset_id: testsetId, origin: TestCaseOrigin.GENERATED, group_name: 'grandes' });
    const pinned = await api().post(`/api/v1/testsets/${testsetId}/cases/${generated.id}/pin`).set(as('judge')).expect(200);
    expect(pinned.body).toMatchObject({ origin: 'manual', group: null, seed: null });
    await api().post(`/api/v1/testsets/${testsetId}/cases/${generated.id}/pin`).set(as('judge')).expect(409);
    // Su semilla sale del esquema ("grandes" solo tenía una, así que sale el grupo): al regenerar no vuelve una copia
    const afterPin = await api().get(`/api/v1/testsets/${testsetId}`).set(as('judge')).expect(200);
    expect(afterPin.body.schema.groups.map((g: { name: string }) => g.name)).toEqual(['chicos']);

    // Deja el testset como estaba para las pruebas siguientes
    for (const id of [...added.body.map((c: { id: number }) => c.id), generated.id]) {
      await api().delete(`/api/v1/testsets/${testsetId}/cases/${id}`).set(as('judge')).expect(204);
    }
    await api().post(`/api/v1/testsets/${testsetId}/generate`).set(as('judge')).send({ schema }).expect(200);
    expect(await caseRepo.countBy({ testset_id: testsetId })).toBe(before);
  });

  it('borrar un caso aleatorio quita su semilla (no vuelve al regenerar); remove-group borra el grupo y su configuración', async () => {
    const url = `/api/v1/testsets/${testsetId}`;
    const second = await caseRepo.findOneByOrFail({ testset_id: testsetId, origin: TestCaseOrigin.GENERATED, group_name: 'chicos', seed: 2 });
    await api().delete(`${url}/cases/${second.id}`).set(as('judge')).expect(204);
    await api().post(`${url}/generate`).set(as('judge')).expect(200);
    const seeds = (await caseRepo.find({ where: { testset_id: testsetId, group_name: 'chicos' }, order: { seed: 'ASC' } })).map((c) => c.seed);
    expect(seeds).toEqual([1, 3]);

    await api().post(`${url}/cases/remove-group`).set(as('observer')).send({ group: 'grandes' }).expect(403);
    const removed = await api().post(`${url}/cases/remove-group`).set(as('judge')).send({ group: 'grandes' }).expect(200);
    expect(removed.body).toEqual({ removed: 1 });
    const detail = await api().get(url).set(as('judge')).expect(200);
    expect(detail.body.schema.groups.map((g: { name: string, seeds: number[] }) => [g.name, g.seeds])).toEqual([['chicos', [1, 3]]]);

    // Deja el testset como estaba para las pruebas siguientes
    await api().post(`${url}/generate`).set(as('judge')).send({ schema }).expect(200);
  });

  it('POST /testsets/:id/signature-detect encola la detección; GET la consulta', async () => {
    const body = { languageId: enabledLanguage.id, source: 'def sumar(nums: list[int], k: int) -> int:\n    return sum(nums) + k\n' };
    await api().post(`/api/v1/testsets/${testsetId}/signature-detect`).set(as('observer')).send(body).expect(403);
    await api().post(`/api/v1/testsets/${testsetId}/signature-detect`).set(as('judge')).send({ ...body, languageId: disabledLanguage.id }).expect(422);

    const started = await api().post(`/api/v1/testsets/${testsetId}/signature-detect`).set(as('judge')).send(body).expect(202);
    expect(started.body).toMatchObject({ id: expect.any(String), status: 'queued', candidates: [] });
    const polled = await api().get(`/api/v1/testsets/${testsetId}/signature-detect/${started.body.id}`).set(as('judge')).expect(200);
    expect(['queued', 'running', 'done']).toContain(polled.body.status);
    await api().get(`/api/v1/testsets/${testsetId}/signature-detect/no-existe`).set(as('judge')).expect(404);
  });

  it('PUT /testsets/:id/ref-solution exige un lenguaje habilitado en la edición', async () => {
    await api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(as('judge'))
      .send({ languageId: disabledLanguage.id, source: 'def sumar(nums, k): return sum(nums) + k' }).expect(422);

    const res = await api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(as('judge'))
      .send({ languageId: enabledLanguage.id, source: 'def sumar(nums, k): return sum(nums) + k' }).expect(200);
    expect(res.body).toMatchObject({ languageId: enabledLanguage.id, createdBy: judge.id, sourceSha: expect.stringMatching(/^[0-9a-f]{64}$/) });

    // El detalle trae el código de su versión, para mostrarlo en el paso Solución aunque no sea la vigente
    const detail = await api().get(`/api/v1/testsets/${testsetId}`).set(as('judge')).expect(200);
    expect(detail.body.refSolution).toMatchObject({ id: res.body.id, languageId: enabledLanguage.id, source: 'def sumar(nums, k): return sum(nums) + k' });
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

    // La revisión manual no cambia casos: se ajusta sin reconstruir, salvo con el problema en el concurso
    const review = (manualReview: boolean) => api().patch(`/api/v1/testsets/${testsetId}`).set(as('judge')).send({ manualReview });
    await review(true).expect(200);
    expect(await testsetRepo.findOneByOrFail({ id: testsetId })).toMatchObject({ manual_review: true, status: TestsetStatus.READY });
    const { status } = await problemRepo.findOneByOrFail({ id: problemId });
    await problemRepo.update(problemId, { status: ProblemStatus.PUBLISHED });
    await review(false).expect(409);
    await problemRepo.update(problemId, { status });
    await review(false).expect(200);

    // Solo una versión en curso a la vez
    await api().post(`/api/v1/problems/${problemId}/testsets`).set(as('judge')).send({ reason: 'otra' }).expect(409);
  });

  it('PATCH cases/visibility publica un caso suelto con el testset ya construido y el problema en el concurso, aunque no sea su autor', async () => {
    const url = `/api/v1/testsets/${testsetId}/cases/visibility`;
    const target = await caseRepo.findOneByOrFail({ testset_id: testsetId, visibility: TestCaseVisibility.HIDDEN });
    const publicCount = () => caseRepo.countBy({ testset_id: testsetId, visibility: TestCaseVisibility.PUBLIC });
    const before = await publicCount();
    const { status } = await problemRepo.findOneByOrFail({ id: problemId });
    await problemRepo.update(problemId, { status: ProblemStatus.PUBLISHED });
    try {
      expect((await testsetRepo.findOneByOrFail({ id: testsetId })).status).toBe(TestsetStatus.READY);
      const res = await api().patch(url).set(as('colleague')).send({ caseId: target.id, visibility: 'public' }).expect(200);
      expect(res.body).toEqual({ updated: 1 });
      expect((await caseRepo.findOneByOrFail({ id: target.id })).visibility).toBe(TestCaseVisibility.PUBLIC);
      expect(await publicCount()).toBe(before + 1); // solo ese caso, no su grupo
      await api().patch(url).set(as('observer')).send({ caseId: target.id, visibility: 'hidden' }).expect(403);
      await api().patch(url).set(as('colleague')).send({ caseId: 999999999, visibility: 'hidden' }).expect(404);
      await api().patch(url).set(as('colleague')).send({ caseId: target.id, visibility: 'hidden' }).expect(200);
    } finally {
      await problemRepo.update(problemId, { status });
    }
  });

  it('el preview muestra los casos públicos con salida y publicar ya no tiene errores de testset', async () => {
    const preview = await api().get(`/api/v1/problems/${problemId}/preview`).set(as('judge')).expect(200);
    expect(preview.body.signature).toEqual(signature);
    expect(preview.body.samples).toHaveLength(2);
    expect(preview.body.samples[0]).toEqual({ input: '{"nums":[1,2,3],"k":9007199254740993}', output: '6' });

    await api().post(`/api/v1/problems/${problemId}/propose`).set(as('judge')).expect(200);
    // Con el problema propuesto la firma ya no cambia
    await api().patch(`/api/v1/problems/${problemId}/signature`).set(as('judge')).send(signature).expect(409);
  });

  it('cambiar la firma con casos: quitar un parámetro pide confirmación y lo quita; marcar un tamaño lo calcula', async () => {
    const { body: base } = await api().get(`/api/v1/problems/${problemId}`).set(as('judge')).expect(200);
    const { body: created } = await api().post(`/api/v1/editions/${edition.id}/problems`).set(as('judge'))
      .send({ categoryId: base.categoryId, title: 'Firma con casos ' + stamp, statement: 'x' }).expect(201);
    const int = { type: 'int' };
    const list = { type: 'array', items: int };
    const withN = { functionName: 'f', params: [{ name: 'n', type: int }, { name: 'a', type: list }, { name: 'k', type: int }], returns: int };
    await api().patch(`/api/v1/problems/${created.id}/signature`).set(as('judge')).send(withN).expect(200);
    await api().patch(`/api/v1/testsets/${created.testsetId}`).set(as('judge')).send({ schema: {
      params: { n: { type: 'int', min: 0, max: 3 }, a: { type: 'array', length: [0, 3], items: { type: 'int', min: 1, max: 9 } }, k: { type: 'int', min: 0, max: 9 } },
      groups: [{ name: 'g', seeds: [1], overrides: { n: { min: 1 } } }],
    } }).expect(200);
    await api().post(`/api/v1/testsets/${created.testsetId}/cases/bulk`).set(as('judge'))
      .send({ cases: [{ input: { n: 2, a: [1, 2], k: 5 } }, { input: { n: 1, a: [7], k: 0 } }] }).expect(201);

    // Marcar n como tamaño de a: los casos ya cuadran y n sale del esquema, sin confirmar
    const sized = { ...withN, params: [withN.params[0], { ...withN.params[1], size: 'n' }, withN.params[2]] };
    await api().patch(`/api/v1/problems/${created.id}/signature`).set(as('judge')).send(sized).expect(200);
    let detail = await api().get(`/api/v1/testsets/${created.testsetId}`).set(as('judge')).expect(200);
    expect(Object.keys(detail.body.schema.params)).toEqual(['a', 'k']);
    expect(detail.body.schema.groups[0].overrides).toEqual({});

    // Quitar n: 422 que pide confirmación; con adaptCases se quita de los casos y su salida se recalcula al construir
    const withoutN = { functionName: 'f', params: [{ name: 'a', type: list }, { name: 'k', type: int }], returns: int };
    const asked = await api().patch(`/api/v1/problems/${created.id}/signature`).set(as('judge')).send(withoutN).expect(422);
    expect(asked.body.errors).toEqual(['signature removes parameter(s) n from 2 case(s); send adaptCases to update them']);
    await api().patch(`/api/v1/problems/${created.id}/signature`).set(as('judge')).send({ ...withoutN, adaptCases: true }).expect(200);
    detail = await api().get(`/api/v1/testsets/${created.testsetId}`).set(as('judge')).expect(200);
    expect(detail.body.cases.map((c: { inputPreview: string, outputSha: string | null }) => [c.inputPreview, c.outputSha]))
      .toEqual([['{"a":[1,2],"k":5}', null], ['{"a":[7],"k":0}', null]]);

    // Agregar un parámetro no se ajusta solo, aunque se pida
    const added = await api().patch(`/api/v1/problems/${created.id}/signature`).set(as('judge'))
      .send({ ...withoutN, params: [...withoutN.params, { name: 'm', type: int }], adaptCases: true }).expect(422);
    expect(added.body.errors).toEqual(expect.arrayContaining(['case #1 input.m: missing']));
  });
});
