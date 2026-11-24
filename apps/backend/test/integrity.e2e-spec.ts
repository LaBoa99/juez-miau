import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Repository } from 'typeorm';
import { EditionStatus, FlagOutcome, FlagType, StaffRole, type IAuditEntry, type IFlag, type IStandings } from '@concurso/shared-types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { StaffUser } from '../src/staff/entities/staff-user.entity.js';
import { Edition } from '../src/editions/entities/edition.entity.js';
import { EditionStaff } from '../src/editions/entities/edition-staff.entity.js';
import { Category } from '../src/editions/entities/category.entity.js';
import { Flag } from '../src/flags/entities/flag.entity.js';
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
    expect(res.body).toEqual({ nextHeartbeatMs: 10_000 });
    await heartbeat(['chrome.exe', 'discord']);

    const forbidden = (await flags()).filter((flag) => flag.type === FlagType.FORBIDDEN_PROCESS);
    expect(forbidden.map((flag) => flag.details).sort()).toEqual(['Proceso prohibido en ejecución: Discord', 'Proceso prohibido en ejecución: chrome']);
    await api().post('/api/v1/contest/heartbeat').set(bearer(adminToken)).send({}).expect(403);
  });

  it('el heartbeat reporta monitores de más, almacenamiento USB e interfaces de red nuevas, según la edición', async () => {
    const heartbeat = (body: object) =>
      api().post('/api/v1/contest/heartbeat').set(bearer(teamToken)).send(body).expect(200);
    const hardware = async () => (await flags())
      .filter((flag) => [FlagType.EXTRA_MONITOR, FlagType.USB_STORAGE, FlagType.NETWORK_CHANGE].includes(flag.type))
      .map((flag) => flag.details).sort();

    // El primer reporte de red de la sesión fija la base
    await heartbeat({ monitors: 1, usbStorage: [], networkInterfaces: ['Ethernet'] });
    expect(await hardware()).toEqual([]);

    const suspicious = { monitors: 2, usbStorage: ['E:\\'], networkInterfaces: ['Ethernet', 'Wi-Fi'] };
    await heartbeat(suspicious);
    await heartbeat(suspicious);
    expect(await hardware()).toEqual([
      '2 monitores conectados (máximo 1)', 'Almacenamiento USB conectado: E:\\', 'Interfaz de red nueva: Wi-Fi',
    ]);

    // Con las reglas apagadas no se levanta nada nuevo
    await repo(Edition).update(edition.id, { max_monitors: null, watch_usb_storage: false, watch_network: false });
    await heartbeat({ monitors: 3, usbStorage: ['F:\\'], networkInterfaces: ['Ethernet', 'Hotspot'] });
    expect(await hardware()).toHaveLength(3);
    await repo(Edition).update(edition.id, { max_monitors: 1, watch_usb_storage: true, watch_network: true });

    await api().post('/api/v1/contest/heartbeat').set(bearer(teamToken)).send({ monitors: -1 }).expect(400);
  });

  it('un equipo suspendido no puede iniciar sesión', async () => {
    await repo(Team).update(team.id, { suspended_at: new Date() });
    const res = await api().post('/api/v1/auth/team/login')
      .send({ username: team.username, password: teamPassword, machineId: 'maquina-b' }).expect(403);
    expect(res.body.message).toBe('Tu equipo fue suspendido por los jueces');
    await repo(Team).update(team.id, { suspended_at: null });
    teamToken = await login('maquina-b');
  });

  it('un equipo suspendido con la app abierta recibe el motivo, no un cierre de sesión genérico', async () => {
    const heartbeat = (token: string) => api().post('/api/v1/contest/heartbeat').set(bearer(token)).send({}).expect(401);
    const suspended = await api().put(`/api/v1/editions/${edition.id}/teams/${team.id}/suspension`)
      .set(bearer(adminToken)).send({ suspended: true });
    expect(suspended.ok).toBe(true);
    expect((await heartbeat(teamToken)).body.message).toBe('Tu equipo fue suspendido por los jueces');

    await api().put(`/api/v1/editions/${edition.id}/teams/${team.id}/suspension`).set(bearer(adminToken)).send({ suspended: false });
    const oldToken = teamToken;
    teamToken = await login('maquina-b');
    expect((await heartbeat(oldToken)).body.message).not.toMatch(/suspendido/);
  });

  it('el listado de equipos distingue sesión con señal, sin señal y sin sesión', async () => {
    const row = async (id: number) => (await api().get(`/api/v1/editions/${edition.id}/teams`).set(bearer(adminToken)).expect(200))
      .body.items.find((item: { id: number }) => item.id === id);
    expect(await row(team.id)).toMatchObject({ online: true, signalLost: false });

    await repo(TeamSession).update(team.id, { last_heartbeat_at: new Date(Date.now() - 120_000) });
    expect(await row(team.id)).toMatchObject({ online: true, signalLost: true });
    await repo(TeamSession).update(team.id, { last_heartbeat_at: new Date() });

    const second = await repo(Team).save({
      edition_id: edition.id, category_id: team.category_id, name: 'Sin sesión', username: `integridad-sin-${stamp}`, password: 'x', password_hash: 'x',
    });
    expect(await row(second.id)).toMatchObject({ online: false, signalLost: false, lastHeartbeatAt: null });
    await repo(Team).delete(second.id);
  });

  it('con alertas abiertas no se puede enviar; al resolverlas sí', async () => {
    const submit = () => api().post('/api/v1/submissions').set(bearer(teamToken))
      .send({ problemId: 999999, languageId: '00000000-0000-4000-8000-000000000000', source: 'x' });
    expect((await submit().expect(403)).body.message).toMatch(/blocked/);

    // El observador ve y levanta alertas, pero resolverlas es de admin y juez
    const observer = await app.get<Repository<StaffUser>>(getRepositoryToken(StaffUser)).save({ name: 'Observador integridad', email: `integridad-obs-${stamp}@concurso.test`, password_hash: 'x' });
    try {
      await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save({ edition_id: edition.id, staff_user_id: observer.id, role: StaffRole.OBSERVER });
      const observerToken = await app.get(JwtService).signAsync({ ...AccessTokenPayloadFactory.forStaff(observer) });
      await api().get(`/api/v1/editions/${edition.id}/flags`).set(bearer(observerToken)).expect(200);
      await api().post(`/api/v1/flags/${(await flags('?open=true'))[0].id}/resolve`).set(bearer(observerToken)).send({ outcome: FlagOutcome.DISMISSED }).expect(403);
    } finally {
      await app.get<Repository<StaffUser>>(getRepositoryToken(StaffUser)).delete([observer.id]);
    }

    for (const flag of await flags('?open=true')) {
      const res = await api().post(`/api/v1/flags/${flag.id}/resolve`).set(bearer(adminToken))
        .send({ outcome: FlagOutcome.DISMISSED, note: 'revisado en sala' }).expect(200);
      expect(res.body).toMatchObject({ resolvedBy: admin.id, resolutionNote: 'revisado en sala', outcome: FlagOutcome.DISMISSED });
    }
    await api().post(`/api/v1/flags/${(await flags())[0].id}/resolve`).set(bearer(adminToken)).send({}).expect(400);
    await api().post(`/api/v1/flags/${(await flags())[0].id}/resolve`).set(bearer(adminToken)).send({ outcome: FlagOutcome.DISMISSED }).expect(409);
    expect(await flags('?open=true')).toEqual([]);
    // Ya no está bloqueado: falla por el problema, que no existe
    await submit().expect(404);
  });

  it('una sesión sin heartbeat con el concurso corriendo levanta una alerta', async () => {
    await repo(TeamSession).update({ team_id: team.id }, { last_heartbeat_at: new Date(Date.now() - 5 * 60_000) });
    const afterBoot = new Date(Date.now() + 60_000); // recién arrancada la API se espera una ventana completa
    await app.get(IntegrityService).checkHeartbeats(afterBoot);
    await app.get(IntegrityService).checkHeartbeats(afterBoot);
    expect((await flags('?open=true')).map((flag) => flag.type)).toEqual([FlagType.HEARTBEAT_LOST]);
  });

  it('el staff levanta alertas manuales solo sobre equipos de su edición', async () => {
    const res = await api().post(`/api/v1/editions/${edition.id}/flags`).set(bearer(adminToken))
      .send({ teamId: team.id, details: 'Usa el celular' }).expect(201);
    expect(res.body).toMatchObject({ type: FlagType.MANUAL, details: `Usa el celular (staff #${admin.id})` });
    await api().post(`/api/v1/editions/${edition.id}/flags`).set(bearer(adminToken)).send({ teamId: otherTeam.id, details: 'x' }).expect(404);
    await api().get(`/api/v1/editions/${otherEdition.id}/flags`).set(bearer(adminToken)).expect(403);
  });

  it('una alerta confirmada suma 20 minutos una vez por incidente, se corrige y no se filtra con el marcador congelado', async () => {
    const heartbeat = () => api().post('/api/v1/contest/heartbeat').set(bearer(teamToken)).send({ processes: ['chrome'] }).expect(200);
    const decide = (id: number, outcome: FlagOutcome) => api().post(`/api/v1/flags/${id}/resolve`).set(bearer(adminToken)).send({ outcome });
    const chrome = async () => (await flags()).filter((flag) => flag.type === FlagType.FORBIDDEN_PROCESS && flag.details.endsWith('chrome'));
    const penalty = async (path: string) => ((await api().get(path).set(bearer(adminToken)).expect(200)).body as IStandings)
      .categories[0].rows.find((row) => row.teamId === team.id)!.penalty;
    const staff = `/api/v1/editions/${edition.id}/standings`;
    const reopened = () => repo(Flag).update({ team_id: team.id }, { last_seen_at: new Date(Date.now() - 60_000) });

    // El programa se cerró hace rato y se vuelve a abrir: incidente nuevo
    await reopened();
    const before = (await chrome()).length;
    await heartbeat();
    const [flag] = await chrome();
    expect((await chrome()).length).toBe(before + 1);

    await decide(flag.id, FlagOutcome.CONFIRMED).expect(200);
    expect(await penalty(staff)).toBe(20);
    await decide(flag.id, FlagOutcome.CONFIRMED).expect(409);

    // Sigue abierto después de la decisión: mismo incidente, no se penaliza otra vez
    await heartbeat();
    expect((await chrome()).length).toBe(before + 1);

    // Confirmada durante el congelamiento: el staff la ve; el público todavía no
    await repo(Edition).update(edition.id, { freeze_duration_ms: 3_600_000 });
    await decide(flag.id, FlagOutcome.DISMISSED).expect(200);
    await decide(flag.id, FlagOutcome.CONFIRMED).expect(200);
    expect(await penalty(staff)).toBe(20);
    expect(await penalty(`/api/v1/public/editions/${edition.id}/standings`)).toBe(0);
    await repo(Edition).update(edition.id, { freeze_duration_ms: 0 });

    await decide(flag.id, FlagOutcome.DISMISSED).expect(200);
    expect(await penalty(staff)).toBe(0);

    await reopened();
    await heartbeat();
    expect((await chrome()).length).toBe(before + 2);
    await decide((await chrome())[0].id, FlagOutcome.DISMISSED).expect(200);
  });

  it('la reincidencia sale tras el margen, frena los envíos aunque la edición no bloquee y se libera al decidir', async () => {
    const heartbeat = () => api().post('/api/v1/contest/heartbeat').set(bearer(teamToken)).send({ processes: ['chrome'] }).expect(200);
    const decide = (id: number, outcome: FlagOutcome) => api().post(`/api/v1/flags/${id}/resolve`).set(bearer(adminToken)).send({ outcome });
    const chrome = async () => (await flags()).filter((flag) => flag.type === FlagType.FORBIDDEN_PROCESS && flag.details.endsWith('chrome'));
    const submit = () => api().post('/api/v1/submissions').set(bearer(teamToken))
      .send({ problemId: 999999, languageId: '00000000-0000-4000-8000-000000000000', source: 'x' });

    await repo(Edition).update(edition.id, { block_submissions_on_alert: false });
    await repo(Flag).update({ team_id: team.id }, { last_seen_at: new Date(Date.now() - 60_000) });
    await heartbeat();
    const [first] = await chrome();
    expect(first.offense).toBe(1);
    await decide(first.id, FlagOutcome.CONFIRMED).expect(200);
    const total = (await chrome()).length;

    // Dentro del margen para cerrarlo: ni alerta nueva ni bloqueo
    await heartbeat();
    expect((await chrome()).length).toBe(total);
    await submit().expect(404);

    // Pasó el margen y se sigue detectando
    await repo(Flag).update(first.id, { resolved_at: new Date(Date.now() - 3 * 60_000) });
    await heartbeat();
    const [repeat] = await chrome();
    expect(repeat).toMatchObject({ offense: 2, resolvedAt: null });
    expect(repeat.id).not.toBe(first.id);
    await submit().expect(403);

    // Descartada: libera los envíos y no vuelve a sonar mientras siga abierto
    await decide(repeat.id, FlagOutcome.DISMISSED).expect(200);
    await submit().expect(404);
    await heartbeat();
    expect((await chrome()).length).toBe(total + 1);

    await decide(first.id, FlagOutcome.DISMISSED).expect(200);
    await repo(Edition).update(edition.id, { block_submissions_on_alert: true });
  });

  it('cerrar sesión con el concurso en curso levanta una alerta con el tiempo fuera', async () => {
    const closed = async () => (await flags()).filter((flag) => flag.type === FlagType.SESSION_CLOSED);
    await api().post('/api/v1/auth/logout').set(bearer(teamToken)).expect(204);
    const [flag] = await closed();
    expect(flag.details).toContain('aún no vuelve');

    // Un segundo logout con el mismo token ya no cierra nada ni crea otra alerta
    await api().post('/api/v1/auth/logout').set(bearer(teamToken)).expect(204);
    expect(await closed()).toHaveLength(1);

    teamToken = await login('maquina-b');
    const [back] = await closed();
    expect(back.id).toBe(flag.id);
    expect(back.details).toMatch(/volvió después de 0 min \d+ s\./);
    await api().post(`/api/v1/flags/${back.id}/resolve`).set(bearer(adminToken)).send({ outcome: FlagOutcome.DISMISSED }).expect(200);
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
