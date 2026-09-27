import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { StaffRole } from '@concurso/shared-types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { StaffUser } from '../src/staff/entities/staff-user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { Edition } from '../src/editions/entities/edition.entity.js';
import { EditionStaff } from '../src/editions/entities/edition-staff.entity.js';
import { PasswordService } from '../src/utils/services/password.service.js';

describe('Auth staff con cookie httpOnly (e2e)', () => {
  let app: INestApplication<App>;
  let staffRepo: Repository<StaffUser>;
  let refreshRepo: Repository<RefreshToken>;
  let editionRepo: Repository<Edition>;
  let jwt: JwtService;

  const email = `e2e-login-${Date.now()}@concurso.test`;
  const password = 'Secreta123!';
  let user: StaffUser;
  let inactiveUser: StaffUser;
  let edition: Edition;

  const api = () => request(app.getHttpServer());
  const login = (body: object) => api().post('/api/v1/auth/staff/login').send(body);
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');

  const refreshCookie = (res: request.Response) => {
    const header = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='));
    return { header, value: header?.split(';')[0].split('=')[1] };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    staffRepo = app.get(getRepositoryToken(StaffUser));
    refreshRepo = app.get(getRepositoryToken(RefreshToken));
    editionRepo = app.get(getRepositoryToken(Edition));
    jwt = app.get(JwtService);
    const passwordHash = await app.get(PasswordService).hashPassword(password, 4);

    user = await staffRepo.save(
      staffRepo.create({ name: 'Juez E2E', email, password_hash: passwordHash }),
    );
    inactiveUser = await staffRepo.save(
      staffRepo.create({
        name: 'Inactivo E2E',
        email: `inactivo-${email}`,
        password_hash: passwordHash,
        active: false,
      }),
    );

    edition = await editionRepo.save(editionRepo.create({ name: 'Edición E2E' }));
    await app.get<Repository<EditionStaff>>(getRepositoryToken(EditionStaff)).save({
      edition_id: edition.id,
      staff_user_id: user.id,
      role: StaffRole.JUDGE,
    });
  });

  afterAll(async () => {
    // Las FK con CASCADE borran refresh tokens y asignaciones de edición
    await editionRepo.delete(edition.id);
    await staffRepo.delete([user.id, inactiveUser.id]);
    await app.close();
  });

  describe('POST /auth/staff/login', () => {
    it('200: access token en el body y refresh token solo en cookie httpOnly', async () => {
      const res = await login({ email, password }).expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        user: {
          id: user.id,
          name: 'Juez E2E',
          roles: [{ editionId: edition.id, role: StaffRole.JUDGE }],
        },
      });
      expect(res.body).not.toHaveProperty('refreshToken');

      const { header } = refreshCookie(res);
      expect(header).toMatch(/HttpOnly/);
      expect(header).toMatch(/SameSite=Strict/);
      expect(header).toMatch(/Path=\/api\/v1\/auth/);
      expect(header).toMatch(/Max-Age=604800/); // 7 días

      const payload = await jwt.verifyAsync(res.body.accessToken);
      expect(payload).toMatchObject({ sub: user.id, type: 'staff' });
    });

    it('en BD guarda solo el hash del refresh token', async () => {
      const { value } = refreshCookie(await login({ email, password }).expect(200));

      const stored = await refreshRepo.findOne({
        where: { token_hash: hash(value!) },
        relations: { user: true },
      });
      expect(stored!.user.id).toBe(user.id);
      expect(stored!.revoked_at).toBeNull();
      expect(await refreshRepo.findOneBy({ token_hash: value! })).toBeNull();
    });

    it('401 con el mismo mensaje: contraseña mala, email inexistente o usuario inactivo', async () => {
      for (const body of [
        { email, password: 'incorrecta' },
        { email: `nadie-${email}`, password },
        { email: inactiveUser.email, password },
      ]) {
        const res = await login(body).expect(401);
        expect(res.body.message).toBe('Credenciales inválidas');
        expect(refreshCookie(res).header).toBeUndefined();
      }
    });

    it('400: body inválido o con campos extra', async () => {
      await login({ email: 'no-es-email', password: '' }).expect(400);
      await login({ email, password, rol: 'ADMIN' }).expect(400);
    });
  });

  describe('flujo completo: login → me → refresh → logout', () => {
    it('funciona de punta a punta y el logout invalida la cookie', async () => {
      const agent = request.agent(app.getHttpServer());

      const loginRes = await agent.post('/api/v1/auth/staff/login').send({ email, password }).expect(200);
      const { value: cookieValue } = refreshCookie(loginRes);

      await agent
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200)
        .expect({
          type: 'staff',
          id: user.id,
          name: 'Juez E2E',
          roles: [{ editionId: edition.id, role: StaffRole.JUDGE }],
        });

      const refreshRes = await agent.post('/api/v1/auth/refresh').expect(200);
      expect(refreshRes.body).toEqual({ accessToken: expect.any(String) });
      await agent
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
        .expect(200);

      const logoutRes = await agent.post('/api/v1/auth/logout').expect(204);
      expect(refreshCookie(logoutRes).header).toMatch(/refresh_token=;.*Expires=Thu, 01 Jan 1970/);

      const stored = await refreshRepo.findOneBy({ token_hash: hash(cookieValue!) });
      expect(stored!.revoked_at).not.toBeNull();

      await api()
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${cookieValue}`)
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('401 sin cookie', async () => {
      await api().post('/api/v1/auth/refresh').expect(401);
    });

    it('401 con una cookie inventada', async () => {
      await api().post('/api/v1/auth/refresh').set('Cookie', 'refresh_token=falso').expect(401);
    });

    it('401 si el refresh token ya expiró', async () => {
      const { value } = refreshCookie(await login({ email, password }).expect(200));
      await refreshRepo.update({ token_hash: hash(value!) }, { expires_at: new Date(Date.now() - 1000) });

      await api().post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${value}`).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('204 aunque no haya cookie (idempotente)', async () => {
      await api().post('/api/v1/auth/logout').expect(204);
    });
  });

  describe('GET /auth/me', () => {
    it('401 sin Authorization', async () => {
      await api().get('/api/v1/auth/me').expect(401);
    });

    it('401 con un token inválido', async () => {
      await api().get('/api/v1/auth/me').set('Authorization', 'Bearer no.es.jwt').expect(401);
    });
  });

  describe('CORS', () => {
    it('permite el origen del frontend con credenciales', async () => {
      const res = await api()
        .options('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:4200')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:4200');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('no permite otros orígenes', async () => {
      const res = await api()
        .options('/api/v1/auth/refresh')
        .set('Origin', 'https://sitio-malicioso.com')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
