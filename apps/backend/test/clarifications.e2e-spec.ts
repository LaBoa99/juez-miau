import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Repository } from 'typeorm';
import { EditionStatus, ProblemStatus, StaffRole, type IClarification, type IStaffClarification } from '@concurso/shared-types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { StaffUser } from '../src/staff/entities/staff-user.entity.js';
import { Edition } from '../src/editions/entities/edition.entity.js';
import { EditionStaff } from '../src/editions/entities/edition-staff.entity.js';
import { Category } from '../src/editions/entities/category.entity.js';
import { Team } from '../src/teams/entities/team.entity.js';
import { Problem } from '../src/problems/entities/problem.entity.js';
import { TeamSessionsService } from '../src/teams/services/team-sessions.service.js';
import { AccessTokenPayloadFactory } from '../src/auth/factories/access-token-payload.factory.js';

// Fase 6 del cliente: preguntas de los equipos, respuestas del staff visibles para la categoría
describe('Clarificaciones (e2e)', () => {
  let app: INestApplication<App>;
  const stamp = Date.now();
  let judge: StaffUser;
  let observer: StaffUser;
  let edition: Edition;
  let problemA: Problem;
  let otherCategoryProblem: Problem;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const repo = <T extends object>(entity: new () => T) => app.get<Repository<T>>(getRepositoryToken(entity));
  const ask = (who: string, body: object) => api().post('/api/v1/contest/clarifications').set(bearer(tokens[who])).send(body);
  const listFor = async (who: string) =>
    (await api().get('/api/v1/contest/clarifications').set(bearer(tokens[who])).expect(200)).body as IClarification[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const jwt = app.get(JwtService);
    judge = await repo(StaffUser).save({ name: 'Juez clarif', email: `clarif-juez-${stamp}@concurso.test`, password_hash: 'x' });
    observer = await repo(StaffUser).save({ name: 'Obs clarif', email: `clarif-obs-${stamp}@concurso.test`, password_hash: 'x' });
    edition = await repo(Edition).save({ name: `Clarificaciones E2E ${stamp}`, status: EditionStatus.RUNNING, started_at: new Date(), duration_ms: 3_600_000 });
    await repo(EditionStaff).save([
      { edition_id: edition.id, staff_user_id: judge.id, role: StaffRole.JUDGE },
      { edition_id: edition.id, staff_user_id: observer.id, role: StaffRole.OBSERVER },
    ]);
    const prin = await repo(Category).save({ edition_id: edition.id, code: 'PRIN', name: 'Principiantes' });
    const avan = await repo(Category).save({ edition_id: edition.id, code: 'AVAN', name: 'Avanzados' });
    const problem = (category: Category, status = ProblemStatus.PUBLISHED) => repo(Problem).save({
      edition_id: edition.id, category_id: category.id, letter: 'A', title: 'P', statement_md: 'x', input_format: 'x', output_format: 'x', status,
    });
    problemA = await problem(prin);
    otherCategoryProblem = await problem(avan);

    const sessions = app.get(TeamSessionsService);
    for(const [who, category] of [['uno', prin], ['dos', prin], ['avan', avan]] as const){
      const team = await repo(Team).save({
        edition_id: edition.id, category_id: category.id, name: `Equipo ${who}`, username: `clarif-${who}-${stamp}`, password: 'x', password_hash: 'x',
      });
      const { session } = await sessions.start(team.id, 'maquina');
      tokens[who] = await jwt.signAsync({ ...AccessTokenPayloadFactory.forTeam(team, session.session_id!) });
    }
    tokens.judge = await jwt.signAsync({ ...AccessTokenPayloadFactory.forStaff(judge) });
    tokens.observer = await jwt.signAsync({ ...AccessTokenPayloadFactory.forStaff(observer) });
  });

  afterAll(async () => {
    await repo(Team).delete({ edition_id: edition.id });
    await repo(Edition).delete(edition.id);
    await repo(StaffUser).delete([judge.id, observer.id]);
    await app.close();
  });

  it('un equipo pregunta por un problema de su categoría o en general; no por uno ajeno', async () => {
    const asked = (await ask('uno', { problemId: problemA.id, question: '  ¿n puede ser 0?\n Gracias  ' }).expect(201)).body as IClarification;
    expect(asked).toMatchObject({ problemId: problemA.id, question: '¿n puede ser 0?\n Gracias', answer: null, mine: true });
    expect(asked).not.toHaveProperty('teamId');

    await ask('uno', { question: '¿Hay receso?' }).expect(201);
    await ask('uno', { problemId: otherCategoryProblem.id, question: 'x' }).expect(404);
    await ask('uno', { question: '   ' }).expect(400);
    await ask('judge', { question: 'x' }).expect(403);
  });

  it('las pendientes solo las ve quien preguntó; el staff las ve todas con el equipo', async () => {
    expect(await listFor('uno')).toHaveLength(2);
    expect(await listFor('dos')).toEqual([]);

    const staff = (await api().get(`/api/v1/editions/${edition.id}/clarifications`).set(bearer(tokens.observer)).expect(200)).body as IStaffClarification[];
    expect(staff.map((c) => c.teamName)).toEqual(['Equipo uno', 'Equipo uno']);
    await api().get('/api/v1/contest/clarifications').set(bearer(tokens.judge)).expect(403);
  });

  it('al responder, la ven todos los equipos de la categoría (las generales, todas las categorías)', async () => {
    const [general, aboutA] = await listFor('uno');
    const answer = (id: number, who: string) =>
      api().post(`/api/v1/editions/${edition.id}/clarifications/${id}/answer`).set(bearer(tokens[who])).send({ answer: 'Sí.' });

    await answer(aboutA.id, 'observer').expect(403);
    const answered = (await answer(aboutA.id, 'judge').expect(200)).body as IStaffClarification;
    expect(answered).toMatchObject({ answer: 'Sí.', answeredBy: judge.id, teamName: 'Equipo uno' });

    expect(await listFor('dos')).toEqual([expect.objectContaining({ id: aboutA.id, mine: false })]);
    expect(await listFor('avan')).toEqual([]);

    await answer(general.id, 'judge').expect(200);
    expect((await listFor('avan')).map((c) => c.id)).toEqual([general.id]);
    await api().post(`/api/v1/editions/${edition.id}/clarifications/999999/answer`).set(bearer(tokens.judge)).send({ answer: 'x' }).expect(404);
  });

  it('con el concurso terminado ya no se puede preguntar', async () => {
    await repo(Edition).update(edition.id, { status: EditionStatus.FINISHED });
    await ask('dos', { question: '¿Ya acabó?' }).expect(409);
  });
});
