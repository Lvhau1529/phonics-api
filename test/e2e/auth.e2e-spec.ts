/**
 * Luồng xác thực chính: đăng ký → đăng nhập → refresh (body transport) → dùng lại token cũ bị từ chối → /auth/me.
 * Cần DATABASE_URL_TEST (DB Postgres riêng, bị TRUNCATE); không có thì cả file skip.
 */
import { REFRESH_COOKIE_NAME, REFRESH_TRANSPORT_HEADER } from '@phonics/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyMigrations,
  createTestApp,
  type TestApp,
  truncateAll,
  useTestDatabase,
} from '../helpers/create-test-app';

const enabled = useTestDatabase();

describe.skipIf(!enabled)('auth (e2e)', () => {
  let t: TestApp;
  let classId: string;
  const email = 'kid.e2e@demo.local';
  const password = 'Kid12345!';

  beforeAll(async () => {
    applyMigrations();
    t = await createTestApp();
    await truncateAll(t.prisma);
    // Đăng ký cần một lớp đang nhận học sinh (GET /public/classes) — tạo thẳng bằng prisma
    const cls = await t.prisma.class.create({
      data: { name: 'E2E-K2', grade: 'K2', schoolYear: '2026-2027', joinVisible: true },
      select: { id: true },
    });
    classId = cls.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('register → login → refresh → reuse (401 REFRESH_REUSED) → me', async () => {
    const reg = await request(t.server)
      .post('/api/auth/register')
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ email, password, displayName: 'E2E Kid', classId, avatarKey: 'panda' })
      .expect(201);
    expect(reg.body.accessToken).toBeTypeOf('string');
    expect(reg.body.refreshToken).toBeTypeOf('string');
    expect(reg.body.expiresIn).toBeGreaterThan(0);
    expect(reg.body.user).toMatchObject({
      email,
      role: 'STUDENT',
      displayName: 'E2E Kid',
      avatarKey: 'panda',
    });
    expect(reg.headers['set-cookie']).toBeUndefined();

    const login = await request(t.server)
      .post('/api/auth/login')
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ email, password })
      .expect(200);
    const firstRefresh: string = login.body.refreshToken;
    expect(firstRefresh).toBeTypeOf('string');

    const rotated = await request(t.server)
      .post('/api/auth/refresh')
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    expect(rotated.body.refreshToken).toBeTypeOf('string');
    expect(rotated.body.refreshToken).not.toBe(firstRefresh);
    expect(rotated.body.user.id).toBe(reg.body.user.id);

    // Dùng lại token đã xoay vòng → nghi bị đánh cắp: 401 REFRESH_REUSED và cả family bị thu hồi
    const reused = await request(t.server)
      .post('/api/auth/refresh')
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: firstRefresh })
      .expect(401);
    expect(reused.body).toMatchObject({ statusCode: 401, code: 'REFRESH_REUSED' });

    await request(t.server)
      .post('/api/auth/refresh')
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);

    // Access token vẫn còn hạn (JWT ngắn hạn, không bị thu hồi theo refresh family)
    const me = await request(t.server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);
    expect(me.body.user).toMatchObject({ id: reg.body.user.id, email, role: 'STUDENT' });
    expect(Array.isArray(me.body.permissions)).toBe(true);
  });

  it('cookie transport (mặc định): refresh token nằm trong cookie httpOnly đã ký', async () => {
    const login = await request(t.server).post('/api/auth/login').send({ email, password }).expect(200);
    expect(login.body.refreshToken).toBeUndefined();
    const cookies = login.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = cookies?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');

    const refreshed = await request(t.server)
      .post('/api/auth/refresh')
      .set('Cookie', cookie!.split(';')[0])
      .send({})
      .expect(200);
    expect(refreshed.body.accessToken).toBeTypeOf('string');
    expect(refreshed.headers['set-cookie']).toBeDefined();
  });

  it('lỗi theo envelope ApiErrorBody', async () => {
    const wrong = await request(t.server)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect(wrong.body).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

    const noToken = await request(t.server).get('/api/auth/me').expect(401);
    expect(noToken.body.code).toBe('UNAUTHORIZED');

    const invalid = await request(t.server).post('/api/auth/register').send({ email: 'x' }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.details).toBeDefined();
  });
});
