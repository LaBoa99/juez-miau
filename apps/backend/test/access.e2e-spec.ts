import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Repository } from 'typeorm';
import { EditionStatus, StaffRole } from '@concurso/shared-types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { StaffUser } from '../src/staff/entities/staff-user.entity.js';
import { Edition } from '../src/editions/entities/edition.entity.js';
import { EditionStaff } from '../src/editions/entities/edition-staff.entity.js';
import { Category } from '../src/editions/entities/category.entity.js';
import { Team } from '../src/teams/entities/team.entity.js';
import { PasswordService } from '../src/utils/services/password.service.js';
import { AccessTokenPayloadFactory } from '../src/auth/factories/access-token-payload.factory.js';

describe('Control de acceso: guard global, roles por edición y sesión de equipo (e2e)', () => {
  let app: INestApplication<App>;
  let staffRepo: Repository<StaffUser>;
  let editionRepo: Repository<Edition>;

  const stamp = Date.now();
  const teamPassword = 'EquipoE2E123';
  let judge: StaffUser;
  let superadmin: StaffUser;
  let edition: Edition;
  let otherEdition: Edition;
  let team: Team;
  let judgeToken: string;
  let superToken: string;

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const teamLogin = (machineId: string) =>
    api().post('/api/v1/auth/team/login').send({ username: team.username, password: teamPassword, machineId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    staffRepo = app.get(getRepositoryToken(StaffUser));
    editionRepo = app.get(getRepositoryToken(Edition));
    const jwt = app.get(JwtService);
    const passwords = app.get(PasswordService);
    const staffHash = await passwords.hashPassword('Secreta123!', 4);

    judge = await staffRepo.save(staffRepo.create({ name: 'Juez acceso', email: `acceso-juez-${stamp}@concurso.test`, password_hash: staffHash }));
    superadmin = await staffRepo.save(staffRepo.create({ name: 'Super acceso', email: `acceso-super-${stamp}@concurso.test`, password_hash: staffHash, is_superadmin: true }));

    edition = await editionRepo.save(editionRepo.create({ name: 'Acceso E2E', status: EditionStatus.RUNNING }));
    otherEdition = await editionRepo.save(editionRepo.create({ name: 'Acceso E2E ajena' }));
    await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save({
      edition_id: edition.id,
      staff_user_id: judge.id,
      role: StaffRole.JUDGE,
    });

    const category = await app.get<Repository<Category>>(getRepositoryToken(Category)).save({
      edition_id: edition.id, code: 'E2E', name: 'Categoría E2E',
    });
    const teamRepo = app.get<Repository<Team>>(getRepositoryToken(Team));
    team = await teamRepo.save(teamRepo.create({
      edition_id: edition.id,
      category_id: category.id,
      name: 'Equipo acceso',
      username: `acceso-${stamp}`,
      password: await passwords.encryptPassword(teamPassword),
      password_hash: await passwords.hashPassword(teamPassword, 4),
    }));

    judgeToken = await jwt.signAsync(AccessTokenPayloadFactory.forStaff(judge));
    superToken = await jwt.signAsync(AccessTokenPayloadFactory.forStaff(superadmin));
  });

  afterAll(async () => {
    // CASCADE borra categorías, equipos, sesiones y asignaciones
    await app.get<Repository<Team>>(getRepositoryToken(Team)).delete({ edition_id: edition.id });
    await editionRepo.delete([edition.id, otherEdition.id]);
    await staffRepo.delete([judge.id, superadmin.id]);
    await app.close();
  });

  describe('guard global', () => {
    it('401 sin token en rutas que antes estaban abiertas', async () => {
      await api().get('/api/v1/editions').expect(401);
      await api().get(`/api/v1/teams/${team.id}`).expect(401);
      await api().get('/api/v1/staff').expect(401);
    });

    it('las rutas @Public() siguen abiertas', async () => {
      await api().post('/api/v1/auth/refresh').expect(401); // sin cookie, pero llega al servicio
      await api().post('/api/v1/auth/logout').expect(204);
    });
  });

  describe('roles por edición', () => {
    it('el juez lee su edición pero no la edita, ni ve otras', async () => {
      await api().get(`/api/v1/editions/${edition.id}`).set(bearer(judgeToken)).expect(200);
      await api().patch(`/api/v1/editions/${edition.id}`).set(bearer(judgeToken)).send({ name: 'x' }).expect(403);
      await api().get(`/api/v1/editions/${otherEdition.id}`).set(bearer(judgeToken)).expect(403);
    });

    it('resuelve la edición desde el equipo de la ruta', async () => {
      await api().get(`/api/v1/teams/${team.id}`).set(bearer(judgeToken)).expect(200);
      await api().post(`/api/v1/teams/${team.id}/reset-password`).set(bearer(judgeToken)).expect(403);
    });

    it('solo el superadmin gestiona staff', async () => {
      await api().get('/api/v1/staff').set(bearer(judgeToken)).expect(403);
      await api().get('/api/v1/staff').set(bearer(superToken)).expect(200);
    });
  });

  describe('sesión de equipo', () => {
    it('login, me y 403 en rutas de staff', async () => {
      const res = await teamLogin('maquina-a').expect(200);
      expect(res.body.team).toMatchObject({ id: team.id, editionId: edition.id });

      const me = await api().get('/api/v1/auth/me').set(bearer(res.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ type: 'team', id: team.id });

      await api().get(`/api/v1/editions/${edition.id}`).set(bearer(res.body.accessToken)).expect(403);
    });

    it('401 con contraseña incorrecta o si la edición no está activa', async () => {
      await api().post('/api/v1/auth/team/login').send({ username: team.username, password: 'mala', machineId: 'x' }).expect(401);

      await editionRepo.update(edition.id, { status: EditionStatus.DRAFT });
      await teamLogin('maquina-a').expect(401);
      await editionRepo.update(edition.id, { status: EditionStatus.RUNNING });
    });

    it('un login nuevo invalida el token anterior', async () => {
      const first = (await teamLogin('maquina-a').expect(200)).body.accessToken;
      const second = (await teamLogin('maquina-b').expect(200)).body.accessToken;

      await api().get('/api/v1/auth/me').set(bearer(first)).expect(401);
      await api().get('/api/v1/auth/me').set(bearer(second)).expect(200);
    });

    it('logout y cierre por admin invalidan el token', async () => {
      const token = (await teamLogin('maquina-a').expect(200)).body.accessToken;
      await api().post('/api/v1/auth/logout').set(bearer(token)).expect(204);
      await api().get('/api/v1/auth/me').set(bearer(token)).expect(401);

      const again = (await teamLogin('maquina-a').expect(200)).body.accessToken;
      await api().delete(`/api/v1/teams/${team.id}/sessions`).set(bearer(superToken)).expect(204);
      await api().get('/api/v1/auth/me').set(bearer(again)).expect(401);
    });
  });
});
