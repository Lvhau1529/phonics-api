/**
 * Luồng xác thực chính: phụ huynh đăng nhập → refresh (body transport) → dùng lại token cũ bị từ chối → /auth/me.
 * Học sinh không tự đăng nhập (403 STUDENT_LOGIN_DISABLED) — phiên của bé mở qua tài khoản gia đình (e2e families).
 * Cần DATABASE_URL_TEST (DB Postgres riêng, bị TRUNCATE); không có thì cả file skip.
 */
import { API_PREFIX, REFRESH_COOKIE_NAME, REFRESH_TRANSPORT_HEADER } from '@phonics/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '@/database/seeds/seed-helpers';
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
  let parentId: string;
  const email = 'parent.e2e@demo.local';
  const password = 'Parent12345!';

  beforeAll(async () => {
    applyMigrations();
    t = await createTestApp();
    await truncateAll(t.prisma);
    const passwordHash = await hashPassword(password);
    const parent = await t.prisma.user.create({
      data: { email, passwordHash, emailVerified: true, role: 'PARENT', displayName: 'E2E Parent' },
      select: { id: true },
    });
    parentId = parent.id;
    // Học sinh còn sót email / mật khẩu (dữ liệu cũ) vẫn không đăng nhập được
    await t.prisma.user.create({
      data: { email: 'kid.e2e@demo.local', passwordHash, role: 'STUDENT', displayName: 'E2E Kid' },
    });
  });

  afterAll(async () => {
    await t?.close();
  });

  it('học sinh không tự đăng nhập: 403 STUDENT_LOGIN_DISABLED', async () => {
    const res = await request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'kid.e2e@demo.local', password })
      .expect(403);
    expect(res.body.code).toBe('STUDENT_LOGIN_DISABLED');
    await request(t.server).post(`${API_PREFIX}/auth/register`).send({}).expect(404);
  });

  it('login → refresh → reuse (401 REFRESH_REUSED) → me', async () => {
    const login = await request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ email, password })
      .expect(200);
    const firstRefresh: string = login.body.refreshToken;
    expect(firstRefresh).toBeTypeOf('string');

    const rotated = await request(t.server)
      .post(`${API_PREFIX}/auth/refresh`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    expect(rotated.body.refreshToken).toBeTypeOf('string');
    expect(rotated.body.refreshToken).not.toBe(firstRefresh);
    expect(rotated.body.user.id).toBe(parentId);

    // Dùng lại token đã xoay vòng → nghi bị đánh cắp: 401 REFRESH_REUSED và cả family bị thu hồi
    const reused = await request(t.server)
      .post(`${API_PREFIX}/auth/refresh`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: firstRefresh })
      .expect(401);
    expect(reused.body).toMatchObject({ statusCode: 401, code: 'REFRESH_REUSED' });

    await request(t.server)
      .post(`${API_PREFIX}/auth/refresh`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);

    // Access token vẫn còn hạn (JWT ngắn hạn, không bị thu hồi theo refresh family)
    const me = await request(t.server)
      .get(`${API_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);
    expect(me.body.user).toMatchObject({ id: parentId, email, role: 'PARENT' });
    expect(Array.isArray(me.body.permissions)).toBe(true);
  });

  it('cookie transport (mặc định): refresh token nằm trong cookie httpOnly đã ký', async () => {
    const login = await request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);
    expect(login.body.refreshToken).toBeUndefined();
    const cookies = login.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = cookies?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain(`Path=${API_PREFIX}/auth`);

    const refreshed = await request(t.server)
      .post(`${API_PREFIX}/auth/refresh`)
      .set('Cookie', cookie!.split(';')[0])
      .send({})
      .expect(200);
    expect(refreshed.body.accessToken).toBeTypeOf('string');
    expect(refreshed.headers['set-cookie']).toBeDefined();
  });

  it('lỗi theo envelope ApiErrorBody', async () => {
    const wrong = await request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect(wrong.body).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

    const noToken = await request(t.server).get(`${API_PREFIX}/auth/me`).expect(401);
    expect(noToken.body.code).toBe('UNAUTHORIZED');

    const invalid = await request(t.server).post(`${API_PREFIX}/auth/login`).send({ email: 'x' }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.details).toBeDefined();
  });
});
