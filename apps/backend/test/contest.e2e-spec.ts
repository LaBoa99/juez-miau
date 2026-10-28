import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { io, type Socket } from 'socket.io-client';
import { DataSource, Repository } from 'typeorm';
import type { AddressInfo, Server } from 'node:net';
import {
  EditionStatus, SOCKET_EVENTS, StaffRole, SubmissionStatus, TestsetStatus, Verdict,
  type IContestClock, type ISubmission, type IStaffSubmission,
} from '@concurso/shared-types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { StaffUser } from '../src/staff/entities/staff-user.entity.js';
import { Edition } from '../src/editions/entities/edition.entity.js';
import { Category } from '../src/editions/entities/category.entity.js';
import { EditionStaff } from '../src/editions/entities/edition-staff.entity.js';
import { Language } from '../src/languages/entities/language.entity.js';
import { Team } from '../src/teams/entities/team.entity.js';
import { Testset } from '../src/testsets/entities/testset.entity.js';
import { TestCase } from '../src/testsets/entities/test-case.entity.js';
import { Submission } from '../src/submissions/entities/submission.entity.js';
import { SubmissionCase } from '../src/submissions/entities/submission-case.entity.js';
import { TeamSessionsService } from '../src/teams/services/team-sessions.service.js';
import { AccessTokenPayloadFactory } from '../src/auth/factories/access-token-payload.factory.js';
import { BlobsModule } from '../src/blobs/blobs.module.js';
import { JudgeModule } from '../src/judge/judge.module.js';
import { TestsetBuildProcessor } from '../src/testsets/processors/testset-build.processor.js';
import { SubmissionProcessor } from '../src/submissions/processors/submission.processor.js';
import { languageSeeder } from '../src/database/seeds/base/language.seeder.js';

// Simulacro completo en un proceso: la API más los processors del worker (modo desarrollo).
// Ejecuta código en Docker, por eso solo corre con JUDGE_DOCKER=1
@Module({
  imports: [TypeOrmModule.forFeature([Testset, TestCase, Submission, SubmissionCase]), BlobsModule, JudgeModule],
  providers: [TestsetBuildProcessor, SubmissionProcessor],
})
class InProcessJudgeModule {}

const SOLUTIONS = {
  ac: { language: 'cpp', source: '#include <bits/stdc++.h>\nusing namespace std;\nlong long sumar(vector<int> nums, long long k) {\n  long long s = 0;\n  for (int x : nums) s += x;\n  return s * k;\n}\n' },
  wa: { language: 'python', source: 'def sumar(nums, k):\n    return sum(nums) + k\n' },
  ce: { language: 'java', source: 'class Main { static long sumar(int[] nums, long k) { return 0 } }\n' },
};

describe.skipIf(!process.env.JUDGE_DOCKER)('Concurso en vivo: reloj, envíos, juez y tiempo real (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  let editionRepo: Repository<Edition>;
  let submissionRepo: Repository<Submission>;
  const sockets: Socket[] = [];

  const stamp = Date.now();
  let admin: StaffUser;
  let edition: Edition;
  let team: Team;
  let otherTeam: Team;
  let languages: Record<string, Language>;
  let problemId: number;
  let adminToken: string;
  let teamToken: string;
  let otherTeamToken: string;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const connect = (token?: string) => {
    const socket = io(url + '/ws', { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    return new Promise<Socket>((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  };

  // Junta los eventos en orden para revisarlos después
  const record = <T>(socket: Socket, event: string) => {
    const received: T[] = [];
    socket.on(event, (payload: T) => received.push(payload));
    return received;
  };

  const waitFor = async <T>(read: () => T | undefined, timeoutMs = 60_000): Promise<T> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = read();
      if (value !== undefined) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('timed out');
  };

  const submit = (token: string, solution: { language: string, source: string }) =>
    api().post('/api/v1/submissions').set(bearer(token)).send({ problemId, languageId: languages[solution.language].id, source: solution.source });

  // El cooldown entre envíos del mismo equipo se brinca recorriendo hacia atrás los anteriores
  const skipCooldown = (teamId: number) =>
    submissionRepo.createQueryBuilder().update().set({ created_at: () => "created_at - interval '1 minute'" }).where('team_id = :teamId', { teamId }).execute();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, InProcessJudgeModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0);
    url = `http://127.0.0.1:${((app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;

    editionRepo = app.get(getRepositoryToken(Edition));
    submissionRepo = app.get(getRepositoryToken(Submission));
    const staffRepo = app.get<Repository<StaffUser>>(getRepositoryToken(StaffUser));
    const teamRepo = app.get<Repository<Team>>(getRepositoryToken(Team));
    const jwt = app.get(JwtService);

    await languageSeeder.run({ manager: app.get(DataSource).manager } as Parameters<typeof languageSeeder.run>[0]);
    const all = await app.get<Repository<Language>>(getRepositoryToken(Language)).find();
    languages = Object.fromEntries(all.map((language) => [language.code, language]));

    admin = await staffRepo.save(staffRepo.create({ name: 'admin', email: `contest-admin-${stamp}@concurso.test`, password_hash: 'x' }));
    edition = await editionRepo.save(editionRepo.create({
      name: `Contest E2E ${stamp}`, duration_ms: 60 * 60_000, freeze_duration_ms: 10 * 60_000,
    }));
    const categoryRepo = app.get<Repository<Category>>(getRepositoryToken(Category));
    const category = await categoryRepo.save({ edition_id: edition.id, code: 'PRIN', name: 'Principiantes', sort_order: 1 });
    const otherCategory = await categoryRepo.save({ edition_id: edition.id, code: 'AVAN', name: 'Avanzados', sort_order: 2 });
    await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save({
      edition_id: edition.id, staff_user_id: admin.id, role: StaffRole.ADMIN,
    });
    // Java, Python y C++ habilitados; JavaScript no
    for (const code of ['cpp', 'python', 'java']) {
      await editionRepo.createQueryBuilder().relation(Edition, 'languages').of(edition.id).add(languages[code].id);
    }

    const newTeam = (name: string, categoryId: number) =>
      teamRepo.save(teamRepo.create({ edition_id: edition.id, category_id: categoryId, name, username: `${name}-${stamp}`, password: 'x', password_hash: 'x' }));
    team = await newTeam('equipo', category.id);
    otherTeam = await newTeam('otro', otherCategory.id);
    const sessions = app.get(TeamSessionsService);
    const tokenFor = async (t: Team) => jwt.signAsync({ ...AccessTokenPayloadFactory.forTeam(t, (await sessions.start(t.id, 'maquina')).session.session_id!) });
    teamToken = await tokenFor(team);
    otherTeamToken = await tokenFor(otherTeam);
    adminToken = await jwt.signAsync({ ...AccessTokenPayloadFactory.forStaff(admin) });

    // Problema publicado con su testset construido por la solución oficial
    const created = await api().post(`/api/v1/editions/${edition.id}/problems`).set(bearer(adminToken)).send({
      categoryId: category.id, letter: 'A', title: 'Suma', statement: 'Suma los números y multiplica por k.',
      inputFormat: 'nums: int[], k: long', outputFormat: 'long',
    }).expect(201);
    problemId = created.body.id;
    const testsetId = created.body.testsetId;
    await api().patch(`/api/v1/problems/${problemId}/signature`).set(bearer(adminToken)).send({
      functionName: 'sumar',
      params: [{ name: 'nums', type: { type: 'array', items: { type: 'int' } } }, { name: 'k', type: { type: 'long' } }],
      returns: { type: 'long' },
    }).expect(200);
    await api().post(`/api/v1/testsets/${testsetId}/cases`).set(bearer(adminToken)).send({ input: { nums: [1, 2, 3], k: 2 }, visibility: 'public' }).expect(201);
    await api().post(`/api/v1/testsets/${testsetId}/cases`).set(bearer(adminToken)).send({ input: { nums: [5], k: '9007199254740993' } }).expect(201);
    await api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(bearer(adminToken))
      .send({ languageId: languages.python.id, source: 'def sumar(nums, k):\n    return sum(nums) * k\n' }).expect(200);
    await api().post(`/api/v1/testsets/${testsetId}/build`).set(bearer(adminToken)).expect(202);
    const testsetRepo = app.get<Repository<Testset>>(getRepositoryToken(Testset));
    for (let i = 0; i < 120 && (await testsetRepo.findOneByOrFail({ id: testsetId })).status === TestsetStatus.BUILDING; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect((await testsetRepo.findOneByOrFail({ id: testsetId })).status).toBe(TestsetStatus.READY);
    await api().post(`/api/v1/problems/${problemId}/publish`).set(bearer(adminToken)).expect(200);

    // Programada en el futuro: el tick no la arranca sola durante la prueba
    await editionRepo.update(edition.id, { status: EditionStatus.SCHEDULED, scheduled_start: new Date(Date.now() + 3_600_000) });
  }, 180_000);

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    // Los envíos se borran en cascada con el equipo
    await app.get<Repository<Team>>(getRepositoryToken(Team)).delete({ edition_id: edition.id });
    await editionRepo.delete(edition.id);
    await app.get<Repository<StaffUser>>(getRepositoryToken(StaffUser)).delete(admin.id);
    await app.close();
  });

  it('antes de iniciar no muestra problemas ni acepta envíos', async () => {
    const view = await api().get('/api/v1/contest').set(bearer(teamToken)).expect(200);
    expect(view.body.clock).toMatchObject({ status: EditionStatus.SCHEDULED, elapsedMs: 0, frozen: false });
    expect(view.body.problems).toEqual([]);
    expect(view.body.languages.map((language: { code: string }) => language.code)).toEqual(['cpp', 'java', 'python']);

    await submit(teamToken, SOLUTIONS.ac).expect(409);
    await api().get('/api/v1/contest').set(bearer(adminToken)).expect(403);
  });

  it('el admin inicia el reloj y el cambio llega por socket a equipos y proyector', async () => {
    const teamSocket = await connect(teamToken);
    const projector = await connect();
    expect(await projector.emitWithAck(SOCKET_EVENTS.JOIN_PUBLIC, { editionId: edition.id })).toEqual({ ok: true });
    const teamClocks = record<IContestClock>(teamSocket, SOCKET_EVENTS.CLOCK_UPDATE);
    const projectorClocks = record<IContestClock>(projector, SOCKET_EVENTS.CLOCK_UPDATE);

    const res = await api().post(`/api/v1/editions/${edition.id}/clock/start`).set(bearer(adminToken)).expect(200);
    expect(res.body).toMatchObject({ status: EditionStatus.RUNNING, durationMs: 3_600_000 });
    await api().post(`/api/v1/editions/${edition.id}/clock/start`).set(bearer(adminToken)).expect(409);
    await api().post(`/api/v1/editions/${edition.id}/clock/pause`).set(bearer(teamToken)).expect(403);

    await waitFor(() => (teamClocks.length && projectorClocks.length ? true : undefined), 5_000);
    expect(teamClocks[0].status).toBe(EditionStatus.RUNNING);
  });

  it('el equipo ve sus problemas con ejemplos y plantillas; el de otra categoría no', async () => {
    const view = await api().get('/api/v1/contest').set(bearer(teamToken)).expect(200);
    expect(view.body.problems).toHaveLength(1);
    expect(view.body.problems[0]).toMatchObject({
      id: problemId, letter: 'A', samples: [{ input: '{"nums":[1,2,3],"k":2}', output: '12' }],
    });
    expect(view.body.problems[0].starterCode.cpp).toContain('long long sumar(vector<int> nums, long long k)');
    expect(Object.keys(view.body.problems[0].starterCode).sort()).toEqual(['cpp', 'java', 'python']);

    const other = await api().get('/api/v1/contest').set(bearer(otherTeamToken)).expect(200);
    expect(other.body.problems).toEqual([]);
    await submit(otherTeamToken, SOLUTIONS.ac).expect(404);
  });

  it('valida lenguaje habilitado y cooldown', async () => {
    await api().post('/api/v1/submissions').set(bearer(teamToken))
      .send({ problemId, languageId: languages.javascript.id, source: 'function sumar() {}' }).expect(422);
    await api().post('/api/v1/submissions').set(bearer(adminToken))
      .send({ problemId, languageId: languages.cpp.id, source: 'x' }).expect(403);
  });

  it('AC, WA y CE: el veredicto llega por socket y el staff ve el detalle por caso', async () => {
    const teamSocket = await connect(teamToken);
    const staffSocket = await connect(adminToken);
    expect(await staffSocket.emitWithAck(SOCKET_EVENTS.JOIN_EDITION, { editionId: edition.id })).toEqual({ ok: true });
    expect(await teamSocket.emitWithAck(SOCKET_EVENTS.JOIN_EDITION, { editionId: edition.id })).toMatchObject({ ok: false });
    const teamUpdates = record<ISubmission>(teamSocket, SOCKET_EVENTS.SUBMISSION_UPDATE);
    const staffUpdates = record<IStaffSubmission>(staffSocket, SOCKET_EVENTS.SUBMISSION_UPDATE);

    const results: Record<string, number> = {};
    for (const [expected, solution] of Object.entries(SOLUTIONS)) {
      await skipCooldown(team.id);
      const res = await submit(teamToken, solution).expect(202);
      expect(res.body).toMatchObject({ status: SubmissionStatus.QUEUED, verdict: null, problemId });
      results[expected] = res.body.id;
    }
    // Sin brincar el cooldown
    await submit(teamToken, SOLUTIONS.ac).expect(429);

    for (const [expected, id] of Object.entries(results)) {
      const done = await waitFor(() => teamUpdates.find((update) => update.id === id && update.status === SubmissionStatus.DONE));
      expect(done.verdict).toBe(expected.toUpperCase());
    }
    expect(teamUpdates.find((update) => update.id === results.ce && update.status === SubmissionStatus.DONE)?.compileLog).toMatch(/';' expected/);

    // El staff recibe el detalle por caso; el equipo no
    const staffWa = await waitFor(() => staffUpdates.find((update) => update.id === results.wa && update.status === SubmissionStatus.DONE));
    expect(staffWa.cases.map((testCase) => testCase.verdict)).toEqual([Verdict.WA, Verdict.WA]);
    expect('cases' in teamUpdates[0]).toBe(false);

    const teamDetail = await api().get(`/api/v1/submissions/${results.ac}`).set(bearer(teamToken)).expect(200);
    expect(teamDetail.body).toMatchObject({ verdict: Verdict.AC, source: SOLUTIONS.ac.source });
    expect(teamDetail.body.cases).toBeUndefined();
    await api().get(`/api/v1/submissions/${results.ac}`).set(bearer(otherTeamToken)).expect(404);

    const staffDetail = await api().get(`/api/v1/submissions/${results.ac}`).set(bearer(adminToken)).expect(200);
    expect(staffDetail.body.cases).toHaveLength(2);
    const list = await api().get(`/api/v1/editions/${edition.id}/submissions?verdict=AC`).set(bearer(adminToken)).expect(200);
    expect(list.body.map((submission: IStaffSubmission) => submission.id)).toEqual([results.ac]);

    const mine = await api().get('/api/v1/submissions').set(bearer(teamToken)).expect(200);
    expect(mine.body.map((submission: ISubmission) => submission.id)).toEqual([results.ce, results.wa, results.ac]);
  }, 180_000);

  it('en pausa y al terminar no se aceptan envíos; el tiempo de pausa no cuenta', async () => {
    await skipCooldown(team.id);
    await api().post(`/api/v1/editions/${edition.id}/clock/pause`).set(bearer(adminToken)).expect(200);
    await submit(teamToken, SOLUTIONS.ac).expect(409);
    const paused = (await api().get(`/api/v1/editions/${edition.id}/clock`).set(bearer(adminToken)).expect(200)).body as IContestClock;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const stillPaused = (await api().get(`/api/v1/public/editions/${edition.id}/clock`).expect(200)).body as IContestClock;
    expect(stillPaused.elapsedMs).toBe(paused.elapsedMs);

    await api().post(`/api/v1/editions/${edition.id}/clock/resume`).set(bearer(adminToken)).expect(200);
    const finished = await api().post(`/api/v1/editions/${edition.id}/clock/finish`).set(bearer(adminToken)).expect(200);
    expect(finished.body.status).toBe(EditionStatus.FINISHED);
    expect(finished.body.elapsedMs).toBeLessThan(paused.elapsedMs + 2_000);
    await submit(teamToken, SOLUTIONS.ac).expect(409);
  });
});
