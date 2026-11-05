/**
 * Tài khoản gia đình: phụ huynh đăng ký 2 bé → bị chặn khi chờ duyệt → GV duyệt bé lớp mình → vào hồ sơ bé (token
 * học sinh có `act`) → gỡ liên kết làm phiên của bé hết hiệu lực; admin chuyển học sinh đang tự đăng nhập sang tài
 * khoản gia đình; tạo tài khoản + đặt mật khẩu từ link mời.
 * Cần DATABASE_URL_TEST (DB Postgres riêng, bị TRUNCATE); không có thì cả file skip.
 */
import { API_PREFIX, REFRESH_TRANSPORT_HEADER } from '@phonics/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '@/modules/auth/services/password.service';
import {
  applyMigrations,
  createTestApp,
  type TestApp,
  truncateAll,
  useTestDatabase,
} from '../helpers/create-test-app';

const enabled = useTestDatabase();
const PASSWORD = 'Secret123!';

describe.skipIf(!enabled)('families (e2e)', () => {
  let t: TestApp;
  let classA: string;
  let classB: string;
  let adminToken: string;
  let teacherToken: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function login(email: string, password = PASSWORD) {
    return request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ email, password });
  }

  beforeAll(async () => {
    applyMigrations();
    t = await createTestApp();
    await truncateAll(t.prisma);
    const passwordHash = await new PasswordService().hash(PASSWORD);
    await t.prisma.user.create({
      data: { email: 'admin.fam@e2e.local', passwordHash, role: 'ADMIN', displayName: 'Admin' },
    });
    const teacher = await t.prisma.user.create({
      data: { email: 'teacher.fam@e2e.local', passwordHash, role: 'TEACHER', displayName: 'Teacher' },
    });
    classA = (
      await t.prisma.class.create({
        data: {
          name: 'FAM-A',
          grade: 'K2',
          schoolYear: '2026-2027',
          teachers: { create: { teacherId: teacher.id } },
        },
      })
    ).id;
    classB = (await t.prisma.class.create({ data: { name: 'FAM-B', grade: 'K3', schoolYear: '2026-2027' } }))
      .id;
    adminToken = (await login('admin.fam@e2e.local')).body.accessToken;
    teacherToken = (await login('teacher.fam@e2e.local')).body.accessToken;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('đăng ký gia đình → chờ duyệt → GV duyệt bé lớp mình → vào hồ sơ bé → gỡ liên kết', async () => {
    const reg = await request(t.server)
      .post(`${API_PREFIX}/auth/register-family`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({
        credentials: { type: 'password', email: 'lan.fam@e2e.local', password: PASSWORD },
        parent: { fullName: 'Nguyễn Thị Lan', phone: '0912 345 678' },
        children: [
          { vietnameseName: 'Nguyễn Văn An', englishName: 'Andy', avatarKey: 'tiger', classId: classA },
          { vietnameseName: 'Nguyễn Thị Bình', classId: classB },
        ],
      })
      .expect(201);
    expect(reg.body).toMatchObject({ created: true, user: { role: 'PARENT', status: 'PENDING' } });
    const parentToken: string = reg.body.accessToken;
    const parentId: string = reg.body.user.id;

    // Chờ duyệt: chỉ màn "đang chờ duyệt" (me, profiles, me/children); route khác 403 ACCOUNT_PENDING
    await request(t.server).get(`${API_PREFIX}/auth/me`).set(auth(parentToken)).expect(200);
    const profiles = await request(t.server)
      .get(`${API_PREFIX}/auth/profiles`)
      .set(auth(parentToken))
      .expect(200);
    expect(
      profiles.body.items.map((p: { displayName: string; status: string }) => [p.displayName, p.status]),
    ).toEqual([
      ['Andy', 'PENDING'],
      ['Nguyễn Thị Bình', 'PENDING'],
    ]);
    const [an, binh] = profiles.body.items as { id: string }[];
    const blocked = await request(t.server)
      .post(`${API_PREFIX}/auth/switch-profile`)
      .set(auth(parentToken))
      .send({ studentId: an.id })
      .expect(403);
    expect(blocked.body.code).toBe('ACCOUNT_PENDING');
    const guardian = await request(t.server)
      .get(`${API_PREFIX}/me/guardian`)
      .set(auth(parentToken))
      .expect(200);
    expect(guardian.body).toMatchObject({ email: 'lan.fam@e2e.local', phone: '+84912345678' });

    // GV chỉ thấy bé đăng ký vào lớp mình
    const pending = await request(t.server)
      .get(`${API_PREFIX}/families/pending`)
      .set(auth(teacherToken))
      .expect(200);
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0]).toMatchObject({
      id: parentId,
      parent: { fullName: 'Nguyễn Thị Lan', email: 'lan.fam@e2e.local' },
      otherChildren: 1,
    });
    expect(pending.body.items[0].children.map((c: { studentId: string }) => c.studentId)).toEqual([an.id]);
    const count = await request(t.server)
      .get(`${API_PREFIX}/families/pending/count`)
      .set(auth(adminToken))
      .expect(200);
    expect(count.body).toEqual({ count: 2 });

    await request(t.server)
      .post(`${API_PREFIX}/families/${parentId}/approve`)
      .set(auth(teacherToken))
      .send({ children: [{ studentId: binh.id, classId: classB }] })
      .expect(403);
    const approved = await request(t.server)
      .post(`${API_PREFIX}/families/${parentId}/approve`)
      .set(auth(teacherToken))
      .send({ children: [{ studentId: an.id, classId: classA }] })
      .expect(200);
    expect(approved.body).toEqual({ approved: [an.id], rejected: [], parentStatus: 'ACTIVE' });
    const again = await request(t.server)
      .post(`${API_PREFIX}/families/${parentId}/approve`)
      .set(auth(teacherToken))
      .send({ children: [{ studentId: an.id, classId: classA }] })
      .expect(409);
    expect(again.body.code).toBe('CONFLICT');

    // Phụ huynh ACTIVE: vào hồ sơ An (đã duyệt), Bình còn chờ
    await request(t.server)
      .post(`${API_PREFIX}/auth/switch-profile`)
      .set(auth(parentToken))
      .send({ studentId: binh.id })
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('PROFILE_NOT_APPROVED'));
    // Cookie transport mặc định nhưng refresh token của bé luôn trả trong body (không ghi đè cookie của phụ huynh)
    const kid = await request(t.server)
      .post(`${API_PREFIX}/auth/switch-profile`)
      .set(auth(parentToken))
      .send({ studentId: an.id })
      .expect(200);
    expect(kid.body.refreshToken).toBeTypeOf('string');
    expect(kid.headers['set-cookie']).toBeUndefined();
    expect(kid.body.user).toMatchObject({
      id: an.id,
      role: 'STUDENT',
      email: null,
      class: { id: classA },
    });
    const kidMe = await request(t.server)
      .get(`${API_PREFIX}/auth/me`)
      .set(auth(kid.body.accessToken))
      .expect(200);
    expect(kidMe.body.actor).toEqual({ id: parentId, displayName: 'Nguyễn Thị Lan' });
    await request(t.server).get(`${API_PREFIX}/me/points`).set(auth(kid.body.accessToken)).expect(200);
    // Token phụ huynh không gọi được route của học sinh
    const parentOnStudentRoute = await request(t.server)
      .get(`${API_PREFIX}/me/points`)
      .set(auth(parentToken))
      .expect(403);
    expect(parentOnStudentRoute.body.code).toBe('FORBIDDEN');

    const rotated = await request(t.server)
      .post(`${API_PREFIX}/auth/refresh`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: kid.body.refreshToken })
      .expect(200);

    // Admin gỡ liên kết → phiên của bé do phụ huynh mở hết hiệu lực
    await request(t.server)
      .put(`${API_PREFIX}/students/${an.id}/guardians`)
      .set(auth(adminToken))
      .send({ guardians: [] })
      .expect(200);
    await request(t.server).get(`${API_PREFIX}/auth/me`).set(auth(kid.body.accessToken)).expect(401);
    await request(t.server)
      .post(`${API_PREFIX}/auth/refresh`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);

    // Admin từ chối Bình; phụ huynh vẫn ACTIVE (đã có bé được duyệt)
    const rejected = await request(t.server)
      .post(`${API_PREFIX}/families/${parentId}/reject`)
      .set(auth(adminToken))
      .send({ reason: 'Lớp đã đủ sĩ số' })
      .expect(200);
    expect(rejected.body).toEqual({ approved: [], rejected: [binh.id], parentStatus: 'ACTIVE' });

    const mails = await t.prisma.mailOutbox.findMany({ orderBy: { createdAt: 'asc' } });
    expect(mails.map((m) => [m.kind, m.toEmail])).toEqual([
      ['family.approved', 'lan.fam@e2e.local'],
      ['family.rejected', 'lan.fam@e2e.local'],
    ]);
    expect(mails[0].text).toContain('Nguyễn Văn An (Andy)');
  });

  it('tạo tài khoản gia đình → mail mời → đặt mật khẩu (link dùng một lần)', async () => {
    const created = await request(t.server)
      .post(`${API_PREFIX}/guardians`)
      .set(auth(adminToken))
      .send({ fullName: 'Lê Văn Hùng', email: 'hung.fam@e2e.local' })
      .expect(201);
    const account = await request(t.server)
      .post(`${API_PREFIX}/guardians/${created.body.id}/family-account`)
      .set(auth(adminToken))
      .expect(200);
    expect(account.body).toMatchObject({
      inviteSent: true,
      guardian: { account: { status: 'ACTIVE', hasCredentials: false } },
    });

    const mail = await t.prisma.mailOutbox.findFirstOrThrow({ where: { kind: 'parent.invite' } });
    expect(mail.toEmail).toBe('hung.fam@e2e.local');
    const token = /set-password\?token=([\w-]+)/.exec(mail.text)?.[1];
    expect(token).toBeDefined();

    const set = await request(t.server)
      .post(`${API_PREFIX}/auth/set-password`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ token, password: 'NewParent1!' })
      .expect(200);
    expect(set.body.user).toMatchObject({ role: 'PARENT', email: 'hung.fam@e2e.local' });
    await login('hung.fam@e2e.local', 'NewParent1!').expect(200);

    const reused = await request(t.server)
      .post(`${API_PREFIX}/auth/set-password`)
      .send({ token, password: 'Another1!' })
      .expect(400);
    expect(reused.body.code).toBe('INVITE_TOKEN_INVALID');
  });
});
