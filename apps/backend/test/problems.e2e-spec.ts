import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Repository } from 'typeorm';
import { StaffRole, TestCaseOrigin, TestCaseVisibility, TestsetStatus } from '@concurso/shared-types';
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
import { RefSolution } from '../src/testsets/entities/ref-solution.entity.js';

describe('Problemas para staff (e2e)', () => {
  let app: INestApplication<App>;
  let staffRepo: Repository<StaffUser>;
  let editionRepo: Repository<Edition>;
  let categoryRepo: Repository<Category>;
  let languageRepo: Repository<Language>;
  let problemRepo: Repository<Problem>;
  let testsetRepo: Repository<Testset>;

  const stamp = Date.now();
  let judge: StaffUser;
  let observer: StaffUser;
  let outsider: StaffUser;
  let superadmin: StaffUser;
  let edition: Edition;
  let otherEdition: Edition;
  let category: Category;
  let otherCategory: Category;
  let foreignCategory: Category;
  let language: Language;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const body = (overrides: object = {}) => ({
    categoryId: category.id,
    letter: 'A',
    title: 'Suma de dos números',
    statement: 'Dados **a** y **b**, imprime su suma.',
    inputFormat: 'Dos enteros a y b.',
    outputFormat: 'Un entero.',
    ...overrides,
  });
  const createProblem = (overrides: object = {}) =>
    api().post(`/api/v1/editions/${edition.id}/problems`).set(as('judge')).send(body(overrides));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    staffRepo = app.get(getRepositoryToken(StaffUser));
    editionRepo = app.get(getRepositoryToken(Edition));
    categoryRepo = app.get(getRepositoryToken(Category));
    languageRepo = app.get(getRepositoryToken(Language));
    problemRepo = app.get(getRepositoryToken(Problem));
    testsetRepo = app.get(getRepositoryToken(Testset));
    const jwt = app.get(JwtService);

    const newStaff = (name: string, extra: Partial<StaffUser> = {}) =>
      staffRepo.save(
        staffRepo.create({ name, email: `e2e-${name}-${stamp}@concurso.test`, password_hash: 'x', ...extra }),
      );
    judge = await newStaff('judge');
    observer = await newStaff('observer');
    outsider = await newStaff('outsider');
    superadmin = await newStaff('superadmin', { is_superadmin: true });

    edition = await editionRepo.save(editionRepo.create({ name: `Problemas E2E ${stamp}` }));
    otherEdition = await editionRepo.save(editionRepo.create({ name: `Otra E2E ${stamp}` }));
    const newCategory = (edition_id: number, code: string) =>
      categoryRepo.save(categoryRepo.create({ edition_id, code, name: code, sort_order: 1 }));
    category = await newCategory(edition.id, 'PRIN');
    otherCategory = await newCategory(edition.id, 'AVAN');
    foreignCategory = await newCategory(otherEdition.id, 'PRIN');

    await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save([
      { edition_id: edition.id, staff_user_id: judge.id, role: StaffRole.JUDGE },
      { edition_id: edition.id, staff_user_id: observer.id, role: StaffRole.OBSERVER },
    ]);

    language = await languageRepo.save(
      languageRepo.create({
        code: `e2e-${stamp}`,
        image_ref: 'img',
        compile_cmd: '',
        run_cmd: 'run',
        compiler_version: '1',
        file_ext: String(stamp % 10000).padStart(4, '0'),
      }),
    );

    for (const user of [judge, observer, outsider, superadmin]) {
      tokens[user.name] = await jwt.signAsync({ sub: user.id, type: 'staff' });
    }
    tokens.team = await jwt.signAsync({ sub: 1, type: 'team' });
  });

  afterAll(async () => {
    // El CASCADE de la edición borra problemas, testsets, casos, soluciones y asignaciones
    await editionRepo.delete([edition.id, otherEdition.id]);
    await languageRepo.delete(language.id);
    await staffRepo.delete([judge.id, observer.id, outsider.id, superadmin.id]);
    await app.close();
  });

  describe('autorización', () => {
    const list = () => api().get(`/api/v1/editions/${edition.id}/problems`);

    it('401 sin token', async () => {
      await list().expect(401);
    });

    it('403 para token de equipo, observador y staff sin asignar', async () => {
      for (const who of ['team', 'observer', 'outsider']) {
        await list().set(as(who)).expect(403);
      }
    });

    it('200 para juez de la edición y para superadmin', async () => {
      await list().set(as('judge')).expect(200);
      await list().set(as('superadmin')).expect(200);
    });
  });

  describe('POST /editions/:id/problems', () => {
    it('201: crea el problema en borrador con su testset v1 vacío', async () => {
      const res = await createProblem().expect(201);
      expect(res.body).toEqual({ id: expect.any(Number), status: 'draft', testsetId: expect.any(Number) });

      const problem = await problemRepo.findOneByOrFail({ id: res.body.id });
      expect(problem.current_testset_id).toBe(res.body.testsetId);
      expect(problem.points).toBe(1);

      const testset = await testsetRepo.findOneByOrFail({ id: res.body.testsetId });
      expect(testset).toMatchObject({
        problem_id: problem.id,
        version: 1,
        status: TestsetStatus.DRAFT,
        ref_solution_id: null,
        author_id: judge.id,
      });
    });

    it('409: letra repetida en la misma categoría; la misma letra en otra categoría sí se permite', async () => {
      await createProblem().expect(409);
      await createProblem({ categoryId: otherCategory.id }).expect(201);
    });

    it('400: categoría de otra edición, letra inválida o campos extra', async () => {
      await createProblem({ categoryId: foreignCategory.id, letter: 'B' }).expect(400);
      await createProblem({ letter: 'a1' }).expect(400);
      await createProblem({ letter: 'B', status: 'published' }).expect(400);
    });

    it('404: edición inexistente', async () => {
      await api().post('/api/v1/editions/999999999/problems').set(as('judge')).send(body()).expect(404);
    });
  });

  describe('GET /editions/:id/problems', () => {
    it('lista los problemas y filtra por categoría', async () => {
      const all = await api().get(`/api/v1/editions/${edition.id}/problems`).set(as('judge')).expect(200);
      expect(all.body).toHaveLength(2);

      const res = await api()
        .get(`/api/v1/editions/${edition.id}/problems?categoryId=${category.id}`)
        .set(as('judge'))
        .expect(200);
      expect(res.body).toEqual([
        {
          id: expect.any(Number),
          letter: 'A',
          title: 'Suma de dos números',
          categoryId: category.id,
          status: 'draft',
          currentTestsetVersion: 1,
        },
      ]);
    });
  });

  describe('detalle, edición, vista previa, publicación y borrado', () => {
    let problemId: number;
    let testsetId: number;

    beforeAll(async () => {
      const res = await createProblem({ letter: 'C', points: 5 }).expect(201);
      problemId = res.body.id;
      testsetId = res.body.testsetId;
    });

    it('GET /problems/:id devuelve el problema con sus testsets', async () => {
      const res = await api().get(`/api/v1/problems/${problemId}`).set(as('judge')).expect(200);

      expect(res.body).toMatchObject({
        id: problemId,
        editionId: edition.id,
        categoryId: category.id,
        letter: 'C',
        points: 5,
        status: 'draft',
        currentTestsetId: testsetId,
        refSolution: null,
        generator: null,
      });
      expect(res.body.testsets).toHaveLength(1);
      expect(res.body.testsets[0]).toMatchObject({ id: testsetId, version: 1, status: 'draft' });
    });

    it('GET /problems/:id → 404 si no existe, 403 si no es juez de esa edición', async () => {
      await api().get('/api/v1/problems/999999999').set(as('judge')).expect(404);
      await api().get(`/api/v1/problems/${problemId}`).set(as('observer')).expect(403);
    });

    it('PATCH /problems/:id edita el texto y valida la letra', async () => {
      const res = await api()
        .patch(`/api/v1/problems/${problemId}`)
        .set(as('judge'))
        .send({ title: 'Suma (v2)', statement: 'Nuevo enunciado', letter: 'D' })
        .expect(200);
      expect(res.body).toMatchObject({ title: 'Suma (v2)', statement: 'Nuevo enunciado', letter: 'D' });

      await api().patch(`/api/v1/problems/${problemId}`).set(as('judge')).send({ letter: 'A' }).expect(409);
      await api().patch(`/api/v1/problems/${problemId}`).set(as('judge')).send({ points: 10 }).expect(400);
      await api().patch(`/api/v1/problems/${problemId}`).set(as('judge')).send({ categoryId: otherCategory.id }).expect(400);
    });

    it('GET /problems/:id/preview devuelve solo el DTO de equipo', async () => {
      const res = await api().get(`/api/v1/problems/${problemId}/preview`).set(as('judge')).expect(200);

      expect(res.body).toEqual({
        title: 'Suma (v2)',
        statement: 'Nuevo enunciado',
        inputFormat: 'Dos enteros a y b.',
        outputFormat: 'Un entero.',
        signature: null,
        limits: { timeLimitMs: 1000, memoryLimitMb: 256 },
        samples: [],
      });
    });

    it('POST /problems/:id/publish → 422 con la lista de errores si el testset no está listo', async () => {
      const res = await api().post(`/api/v1/problems/${problemId}/publish`).set(as('judge')).expect(422);

      expect(res.body.errors).toEqual([
        'signature is not defined',
        'testset v1 is not built (status: draft)',
        'testset v1 has no reference solution',
        'testset v1 has no test cases',
      ]);
      expect((await problemRepo.findOneByOrFail({ id: problemId })).status).toBe('draft');
    });

    it('POST /problems/:id/publish → 422 si solo hay casos ocultos; 200 con un caso público', async () => {
      const refSolution = await app.get<Repository<RefSolution>>(getRepositoryToken(RefSolution)).save({
        problem_id: problemId,
        language_id: language.id,
        source: Buffer.from('print(sum(map(int, input().split())))'),
        source_sha: 'a'.repeat(64),
        created_by: judge.id,
      });
      await testsetRepo.update(testsetId, { status: TestsetStatus.READY, ref_solution_id: refSolution.id });
      await problemRepo.update(problemId, {
        signature: { functionName: 'sumar', params: [{ name: 'a', type: { type: 'int' } }], returns: { type: 'int' } },
      });

      const caseRepo = app.get<Repository<TestCase>>(getRepositoryToken(TestCase));
      const newCase = (ordinal: number, visibility: TestCaseVisibility) =>
        caseRepo.save({
          testset_id: testsetId,
          ordinal,
          visibility,
          origin: TestCaseOrigin.MANUAL,
          input_sha: 'b'.repeat(64),
          output_sha: 'c'.repeat(64),
          input_bytes: 4,
          output_bytes: 2,
        });

      await newCase(1, TestCaseVisibility.HIDDEN);
      const hiddenOnly = await api().post(`/api/v1/problems/${problemId}/publish`).set(as('judge')).expect(422);
      expect(hiddenOnly.body.errors).toEqual(['testset v1 has no public test cases']);

      await newCase(2, TestCaseVisibility.PUBLIC);
      const res = await api().post(`/api/v1/problems/${problemId}/publish`).set(as('judge')).expect(200);
      expect(res.body).toEqual({ status: 'published' });

      // Publicar de nuevo no cambia nada
      await api().post(`/api/v1/problems/${problemId}/publish`).set(as('judge')).expect(200);
    });

    it('el detalle incluye la solución de referencia del testset vigente', async () => {
      const res = await api().get(`/api/v1/problems/${problemId}`).set(as('judge')).expect(200);

      expect(res.body.refSolution).toMatchObject({
        languageId: language.id,
        source: 'print(sum(map(int, input().split())))',
        sourceSha: 'a'.repeat(64),
      });
    });

    it('DELETE /problems/:id → 409 si está publicado, 204 si es borrador', async () => {
      await api().delete(`/api/v1/problems/${problemId}`).set(as('judge')).expect(409);

      const draft = await createProblem({ letter: 'Z' }).expect(201);
      await api().delete(`/api/v1/problems/${draft.body.id}`).set(as('judge')).expect(204);

      expect(await problemRepo.findOneBy({ id: draft.body.id })).toBeNull();
      expect(await testsetRepo.findOneBy({ id: draft.body.testsetId })).toBeNull();
    });
  });
});
