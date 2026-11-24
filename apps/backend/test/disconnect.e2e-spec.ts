import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { io, type Socket } from 'socket.io-client';
import { Repository } from 'typeorm';
import { EditionStatus, FlagOutcome, FlagType, StaffRole, type IFlag } from '@concurso/shared-types';
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

// Sin Docker: conexiones reales de socket, incluido un proceso que muere con SIGKILL
describe('Cierre de la app de un equipo (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  let admin: StaffUser;
  let edition: Edition;
  let adminToken: string;
  const stamp = Date.now();
  const password = 'EquipoE2E123';
  const teams: Record<'killed' | 'brief' | 'alive' | 'leaving', { team: Team; token: string }> = {} as never;
  const open: Socket[] = [];
  let child: ChildProcess | undefined;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const repo = <T extends object>(entity: new () => T) => app.get<Repository<T>>(getRepositoryToken(entity));
  const login = async (team: Team) => (await api().post('/api/v1/auth/team/login')
    .send({ username: team.username, password, machineId: `maquina-${team.id}` }).expect(200)).body.accessToken as string;
  const flagsOf = async (team: Team) =>
    (await api().get(`/api/v1/editions/${edition.id}/flags?teamId=${team.id}`).set(bearer(adminToken)).expect(200)).body as IFlag[];
  const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
    const socket = io(url + '/ws', { auth: { token }, transports: ['websocket'], reconnection: false });
    open.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0);
    url = `http://127.0.0.1:${((app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;

    const passwords = app.get(PasswordService);
    admin = await repo(StaffUser).save({ name: 'Admin cierre', email: `cierre-admin-${stamp}@concurso.test`, password_hash: 'x' });
    edition = await repo(Edition).save({ name: `Cierre E2E ${stamp}`, status: EditionStatus.RUNNING, started_at: new Date(), duration_ms: 3_600_000 });
    await repo(EditionStaff).save({ edition_id: edition.id, staff_user_id: admin.id, role: StaffRole.ADMIN });
    const category = await repo(Category).save({ edition_id: edition.id, code: 'E2E', name: 'Categoría E2E' });
    adminToken = await app.get(JwtService).signAsync({ ...AccessTokenPayloadFactory.forStaff(admin) });

    for (const key of ['killed', 'brief', 'alive', 'leaving'] as const) {
      const team = await repo(Team).save({
        edition_id: edition.id, category_id: category.id, name: `Equipo ${key}`, username: `cierre-${key}-${stamp}`,
        password: await passwords.encryptPassword(password), password_hash: await passwords.hashPassword(password, 4),
      });
      teams[key] = { team, token: await login(team) };
    }
  });

  afterAll(async () => {
    child?.kill('SIGKILL');
    open.forEach((socket) => socket.disconnect());
    await repo(Team).delete({ edition_id: edition.id });
    await repo(Edition).delete(edition.id);
    await repo(StaffUser).delete(admin.id);
    await app.close();
  });

  it('recién arrancada la API no marca sin señal a quien no pudo reportar', async () => {
    await repo(TeamSession).update({ team_id: teams.killed.team.id }, { last_heartbeat_at: new Date(Date.now() - 300_000) });
    expect(await app.get(IntegrityService).checkHeartbeats()).toBe(0);
    await repo(TeamSession).update({ team_id: teams.killed.team.id }, { last_heartbeat_at: new Date() });
  });

  it('alerta en segundos si matan la app; no si reconecta, sigue reportando o cierra sesión', async () => {
    child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { io } from 'socket.io-client';
      const socket = io(process.argv[1] + '/ws', { auth: { token: process.argv[2] }, transports: ['websocket'] });
      socket.on('connect', () => console.log('up'));
      setInterval(() => {}, 1000);
    `, url, teams.killed.token], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve, reject) => {
      child!.stdout!.once('data', () => resolve());
      child!.once('exit', () => reject(new Error('el proceso del socket terminó antes de conectar')));
    });
    const brief = await connect(teams.brief.token);
    const alive = await connect(teams.alive.token);
    const leaving = await connect(teams.leaving.token);
    await sleep(200);

    const killedAt = Date.now();
    child.removeAllListeners('exit');
    child.kill('SIGKILL');
    brief.disconnect();
    alive.disconnect();
    await api().post('/api/v1/auth/logout').set(bearer(teams.leaving.token)).expect(204);
    leaving.disconnect();

    await sleep(1_000);
    await connect(teams.brief.token);
    await api().post('/api/v1/contest/heartbeat').set(bearer(teams.alive.token)).send({}).expect(200);

    const [flag] = await waitUntil(async () => {
      const found = await flagsOf(teams.killed.team);
      return found.length ? found : undefined;
    }, 20_000);
    expect(flag.type).toBe(FlagType.HEARTBEAT_LOST);
    expect(Date.now() - killedAt).toBeLessThan(16_000);

    await sleep(1_000);
    expect(await flagsOf(teams.brief.team)).toEqual([]);
    expect(await flagsOf(teams.alive.team)).toEqual([]);
    expect((await flagsOf(teams.leaving.team)).map((item) => item.type)).toEqual([FlagType.SESSION_CLOSED]);
  }, 45_000);

  it('tras descartarla no repite mientras siga cerrada, pero otro cierre después de volver sí alerta', async () => {
    const { team } = teams.killed;
    const service = app.get(IntegrityService);
    const later = () => new Date(Date.now() + 60_000);
    const [first] = await flagsOf(team);
    await api().post(`/api/v1/flags/${first.id}/resolve`).set(bearer(adminToken)).send({ outcome: FlagOutcome.DISMISSED }).expect(200);

    await repo(TeamSession).update({ team_id: team.id }, { last_heartbeat_at: new Date(Date.now() - 60_000) });
    await service.checkHeartbeats(later());
    expect(await flagsOf(team)).toHaveLength(1);

    // Volvió a reportar y se cerró otra vez, antes de los 45 s de "mismo incidente"
    const token = await login(team);
    await api().post('/api/v1/contest/heartbeat').set(bearer(token)).send({}).expect(200);
    const session = await repo(TeamSession).findOneByOrFail({ team_id: team.id });
    await service.confirmDisconnected(team.id, session.session_id!, later());
    const after = await flagsOf(team);
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({ type: FlagType.HEARTBEAT_LOST, resolvedAt: null });
  });
});
