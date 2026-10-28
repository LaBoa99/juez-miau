import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Repository } from 'typeorm';
import { EditionStatus, FlagType, StaffRole, type IAuditEntry, type IFlag } from '@concurso/shared-types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { StaffUser } from '../src/staff/entities/staff-user.entity.js';
import { Edition } from '../src/editions/entities/edition.entity.js';
import { EditionStaff } from '../src/editions/entities/edition-staff.entity.js';
import { Category } from '../src/editions/entities/category.entity.js';
import { Team } from '../src/teams/entities/team.entity.js';
import { TeamSession } from '../src/teams/entities/team-session.entity.js';
import { PasswordService } from '../src/utils/services/password.service.js';
import { AccessTokenPayloadFactory } from '../src/auth/factories/access-token-payload.factory.js';
import { IntegrityService } from '../src/integrity/integrity.service.js';
import { sleep, waitUntil } from './helpers/contest-fixture.js';

// Fase 7: alertas (sesión reemplazada, procesos prohibidos, heartbeat perdido), bloqueo de
// envíos con alertas, bitácora de auditoría y exportaciones. No ejecuta código: corre siempre
describe('Integridad: alertas, heartbeat, auditoría y exportaciones (e2e)', () => {
  let app: INestApplication<App>;
  const stamp = Date.now();
  const teamPassword = 'EquipoE2E123';
  let admin: StaffUser;
  let superadmin: StaffUser;
  let edition: Edition;
  let otherEdition: Edition;
  let team: Team;
  let otherTeam: Team;
  let adminToken: string;
  let superToken: string;
  let teamToken: string;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const repo = <T extends object>(entity: new () => T) => app.get<Repository<T>>(getRepositoryToken(entity));
  const login = async (machineId: string) => (await api().post('/api/v1/auth/team/login')
    .send({ username: team.username, password: teamPassword, machineId }).expect(200)).body.accessToken as string;
  const flags = async (query = '') =>
    (await api().get(`/api/v1/editions/${edition.id}/flags${query}`).set(bearer(adminToken)).expect(200)).body as IFlag[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const jwt = app.get(JwtService);
    const passwords = app.get(PasswordService);
    admin = await repo(StaffUser).save({ name: 'Admin integridad', email: `integridad-admin-${stamp}@concurso.test`, password_hash: 'x' });
    superadmin = await repo(StaffUser).save({ name: 'Super integridad', email: `integridad-super-${stamp}@concurso.test`, password_hash: 'x', is_superadmin: true });

    edition = await repo(Edition).save({
      name: `Integridad E2E ${stamp}`, status: EditionStatus.RUNNING, started_at: new Date(), duration_ms: 3_600_000,
      forbidden_processes: ['chrome', 'Discord'], block_submissions_on_alert: true,
    });
    otherEdition = await repo(Edition).save({ name: `Integridad E2E ajena ${stamp}` });
    await repo(EditionStaff).save({ edition_id: edition.id, staff_user_id: admin.id, role: StaffRole.ADMIN });
    const category = await repo(Category).save({ edition_id: edition.id, code: 'E2E', name: 'Categoría E2E' });
    const otherCategory = await repo(Category).save({ edition_id: otherEdition.id, code: 'E2E', name: 'Ajena' });

    team = await repo(Team).save({
      edition_id: edition.id, category_id: category.id, name: 'Equipo integridad', username: `integridad-${stamp}`,
      password: await passwords.encryptPassword(teamPassword), password_hash: await passwords.hashPassword(teamPassword, 4),
    });
    otherTeam = await repo(Team).save({
      edition_id: otherEdition.id, category_id: otherCategory.id, name: 'Ajeno', username: `integridad-ajeno-${stamp}`, password: 'x', password_hash: 'x',
    });

    adminToken = await jwt.signAsync({ ...AccessTokenPayloadFactory.forStaff(admin) });
    superToken = await jwt.signAsync({ ...AccessTokenPayloadFactory.forStaff(superadmin) });
  });

  afterAll(async () => {
    await repo(Team).delete({ edition_id: edition.id });
    await repo(Team).delete({ edition_id: otherEdition.id });
    await repo(Edition).delete([edition.id, otherEdition.id]);
    await repo(StaffUser).delete([admin.id, superadmin.id]);
    await app.close();
  });

  it('iniciar sesión en otra máquina levanta una alerta; en la misma máquina no', async () => {
    await login('maquina-a');
    await login('maquina-a');
    expect(await flags()).toEqual([]);

    teamToken = await login('maquina-b');
    expect(await flags()).toEqual([expect.objectContaining({ type: FlagType.SESSION_REPLACED, teamId: team.id, resolvedAt: null })]);
  });

  it('el heartbeat reporta procesos prohibidos una sola vez mientras la alerta siga abierta', async () => {
    const heartbeat = (processes: string[]) =>
      api().post('/api/v1/contest/heartbeat').set(bearer(teamToken)).send({ processes }).expect(200);

    const res = await heartbeat(['C:\\Program Files\\Google\\Chrome.EXE', 'code', 'explorer.exe']);
    expect(res.body).toEqual({ forbiddenProcesses: ['chrome', 'Discord'], nextHeartbeatMs: 30_000, submissionsBlocked: true });
    await heartbeat(['chrome.exe', 'discord']);

    const forbidden = (await flags()).filter((flag) => flag.type === FlagType.FORBIDDEN_PROCESS);
    expect(forbidden.map((flag) => flag.details).sort()).toEqual(['Proceso prohibido en ejecución: Discord', 'Proceso prohibido en ejecución: chrome']);
    await api().post('/api/v1/contest/heartbeat').set(bearer(adminToken)).send({}).expect(403);
  });

  it('con alertas abiertas no se puede enviar; al resolverlas sí', async () => {
    const submit = () => api().post('/api/v1/submissions').set(bearer(teamToken))
      .send({ problemId: 999999, languageId: '00000000-0000-4000-8000-000000000000', source: 'x' });
    expect((await submit().expect(403)).body.message).toMatch(/blocked/);

    for (const flag of await flags('?open=true')) {
      const res = await api().post(`/api/v1/flags/${flag.id}/resolve`).set(bearer(adminToken)).send({ note: 'revisado en sala' }).expect(200);
      expect(res.body).toMatchObject({ resolvedBy: admin.id, resolutionNote: 'revisado en sala' });
    }
    await api().post(`/api/v1/flags/${(await flags())[0].id}/resolve`).set(bearer(adminToken)).send({}).expect(409);
    expect(await flags('?open=true')).toEqual([]);
    // Ya no está bloqueado: falla por el problema, que no existe
    await submit().expect(404);
  });

  it('una sesión sin heartbeat con el concurso corriendo levanta una alerta', async () => {
    await repo(TeamSession).update({ team_id: team.id }, { last_heartbeat_at: new Date(Date.now() - 5 * 60_000) });
    await app.get(IntegrityService).checkHeartbeats();
    await app.get(IntegrityService).checkHeartbeats();
    expect((await flags('?open=true')).map((flag) => flag.type)).toEqual([FlagType.HEARTBEAT_LOST]);
  });

  it('el staff levanta alertas manuales solo sobre equipos de su edición', async () => {
    const res = await api().post(`/api/v1/editions/${edition.id}/flags`).set(bearer(adminToken))
      .send({ teamId: team.id, details: 'Usa el celular' }).expect(201);
    expect(res.body).toMatchObject({ type: FlagType.MANUAL, details: `Usa el celular (staff #${admin.id})` });
    await api().post(`/api/v1/editions/${edition.id}/flags`).set(bearer(adminToken)).send({ teamId: otherTeam.id, details: 'x' }).expect(404);
    await api().get(`/api/v1/editions/${otherEdition.id}/flags`).set(bearer(adminToken)).expect(403);
  });

  it('los cambios del staff quedan en la bitácora sin datos sensibles; solo la ve un superadmin', async () => {
    await api().patch(`/api/v1/editions/${otherEdition.id}`).set(bearer(superToken)).send({ forbidden_processes: ['steam'] }).expect(200);
    await api().post('/api/v1/staff').set(bearer(superToken))
      .send({ name: 'Auditado', email: `integridad-nuevo-${stamp}@concurso.test`, password: 'Secreta123!' });

    await api().get('/api/v1/audit').set(bearer(adminToken)).expect(403);
    const entries = await waitUntil(async () => {
      const found = (await api().get(`/api/v1/audit?staffUserId=${superadmin.id}`).set(bearer(superToken)).expect(200)).body as IAuditEntry[];
      return found.length >= 2 ? found : undefined;
    }, 5_000);

    const patch = entries.find((entry) => entry.method === 'PATCH')!;
    expect(patch).toMatchObject({ editionId: otherEdition.id, path: `/api/v1/editions/${otherEdition.id}`, statusCode: 200, body: { forbidden_processes: ['steam'] } });
    const created = entries.find((entry) => entry.path === '/api/v1/staff')!;
    expect(created.body).toMatchObject({ name: 'Auditado', password: '[redacted]' });

    await sleep(100);
    await repo(StaffUser).delete({ email: `integridad-nuevo-${stamp}@concurso.test` });
  });

  it('exporta el marcador y los envíos en CSV', async () => {
    const standings = await api().get(`/api/v1/editions/${edition.id}/exports/standings.csv`).set(bearer(adminToken)).expect(200);
    expect(standings.headers['content-type']).toMatch(/text\/csv/);
    expect(standings.text).toContain('Categoría,Lugar,Equipo,Resueltos,Penalización');
    expect(standings.text).toContain('Categoría E2E,1,Equipo integridad,0,0');

    const submissions = await api().get(`/api/v1/editions/${edition.id}/exports/submissions.csv`).set(bearer(adminToken)).expect(200);
    // supertest le quita el BOM al decodificar el texto (csv.spec.ts revisa que esté)
    expect(submissions.text.trim()).toBe('Envío,Equipo,Problema,Lenguaje,Veredicto,Estado,Minuto,Tiempo (ms),Memoria (KB),Rejudges,Fecha');
    await api().get(`/api/v1/editions/${edition.id}/exports/submissions.csv`).set(bearer(teamToken)).expect(403);
  });
});
