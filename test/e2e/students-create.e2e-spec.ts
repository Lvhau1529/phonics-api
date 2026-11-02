/**
 * Thêm học sinh chưa có tài khoản (`POST /students`): GV thêm hai anh em vào ca mình dạy, mỗi bé một giá, chung một
 * phụ huynh → học sinh MANAGED + lịch + giá riêng + một phụ huynh nhận học phí; lần thêm sau trùng email gắn vào phụ
 * huynh cũ; GV không chọn lớp / ca hoặc chọn lớp / ca người khác bị chặn; ADMIN thêm không cần lớp / ca.
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
const FROM = '2026-01-06';

describe.skipIf(!enabled)('create students (e2e)', () => {
  let t: TestApp;
  let adminToken: string;
  let teacherToken: string;
  let classId: string;
  let otherClassId: string;
  let slotId: string;
  let otherSlotId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function login(email: string) {
    return request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ email, password: PASSWORD });
  }

  beforeAll(async () => {
    applyMigrations();
    t = await createTestApp();
    await truncateAll(t.prisma);
    const passwordHash = await new PasswordService().hash(PASSWORD);
    await t.prisma.user.create({
      data: { email: 'admin.create@e2e.local', passwordHash, role: 'ADMIN', displayName: 'Admin' },
    });
    const teacherId = (
      await t.prisma.user.create({
        data: { email: 'teacher.create@e2e.local', passwordHash, role: 'TEACHER', displayName: 'Cô Hoa' },
      })
    ).id;
    const otherId = (
      await t.prisma.user.create({
        data: { email: 'other.create@e2e.local', passwordHash, role: 'TEACHER', displayName: 'Thầy Nam' },
      })
    ).id;
    classId = (
      await t.prisma.class.create({
        data: {
          name: 'CREATE-K2',
          grade: 'K2',
          schoolYear: '2026-2027',
          teachers: { create: { teacherId } },
        },
      })
    ).id;
    otherClassId = (
      await t.prisma.class.create({
        data: {
          name: 'CREATE-K3',
          grade: 'K3',
          schoolYear: '2026-2027',
          teachers: { create: { teacherId: otherId } },
        },
      })
    ).id;
    const slot = (name: string, teacher: string) =>
      t.prisma.extraSlot.create({
        data: {
          name,
          weekday: 2,
          startTime: '18:00',
          endTime: '19:00',
          teachers: { create: { teacherId: teacher } },
        },
      });
    slotId = (await slot('Phonics T3', teacherId)).id;
    otherSlotId = (await slot('Đọc T3', otherId)).id;
    adminToken = (await login('admin.create@e2e.local')).body.accessToken;
    teacherToken = (await login('teacher.create@e2e.local')).body.accessToken;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('GV thêm hai anh em vào ca mình, mỗi bé một giá, chung phụ huynh', async () => {
    const res = await request(t.server)
      .post(`${API_PREFIX}/students`)
      .set(auth(teacherToken))
      .send({
        students: [
          { vietnameseName: 'Trần Minh An', englishName: 'Andy', slotId, pricePerSession: 150_000 },
          { vietnameseName: 'Trần Minh Bình', slotId, pricePerSession: 120_000 },
        ],
        effectiveFrom: FROM,
        parent: { name: 'Chị Lan', email: 'lan.parent@e2e.local', phone: '0912345678' },
      })
      .expect(201);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      displayName: 'Andy',
      vietnameseName: 'Trần Minh An',
      email: null,
      loginMode: 'MANAGED',
      status: 'ACTIVE',
      class: null,
    });
    expect(res.body.affectedSessions).toEqual([]);
    const [anId, binhId] = res.body.items.map((s: { id: string }) => s.id);

    // Một phụ huynh nhận học phí cho cả hai bé
    const guardians = await t.prisma.guardian.findMany({ include: { students: true } });
    expect(guardians).toHaveLength(1);
    expect(guardians[0]!.students.map((l) => [l.studentId, l.isBillingContact]).sort()).toEqual(
      [
        [anId, true],
        [binhId, true],
      ].sort(),
    );

    // Lịch + đơn giá riêng từng bé (ca T3 — ngày 2026-01-06 là thứ Ba)
    const roster = await request(t.server)
      .get(`${API_PREFIX}/extra-slots/${slotId}/students`)
      .query({ date: FROM })
      .set(auth(teacherToken))
      .expect(200);
    const prices = Object.fromEntries(
      roster.body.items.map((s: { studentId: string; rate: { pricePerSession: number } | null }) => [
        s.studentId,
        s.rate?.pricePerSession,
      ]),
    );
    expect(prices).toEqual({ [anId]: 150_000, [binhId]: 120_000 });

    // Bé thứ ba cùng email phụ huynh → gắn vào phụ huynh cũ
    await request(t.server)
      .post(`${API_PREFIX}/students`)
      .set(auth(teacherToken))
      .send({
        students: [{ vietnameseName: 'Trần Minh Chi', classId }],
        parent: { email: 'lan.parent@e2e.local' },
      })
      .expect(201);
    expect(await t.prisma.guardian.count()).toBe(1);
    expect(await t.prisma.studentGuardian.count()).toBe(3);
  });

  it('GV phải chọn lớp / ca mình dạy', async () => {
    const none = await request(t.server)
      .post(`${API_PREFIX}/students`)
      .set(auth(teacherToken))
      .send({ students: [{ vietnameseName: 'Lê Dũng' }] })
      .expect(400);
    expect(none.body.details).toHaveProperty(['students.0.classId']);

    const otherClass = await request(t.server)
      .post(`${API_PREFIX}/students`)
      .set(auth(teacherToken))
      .send({ students: [{ vietnameseName: 'Lê Dũng', classId: otherClassId }] })
      .expect(403);
    expect(otherClass.body.code).toBe('FORBIDDEN_SCOPE');

    await request(t.server)
      .post(`${API_PREFIX}/students`)
      .set(auth(teacherToken))
      .send({ students: [{ vietnameseName: 'Lê Dũng', slotId: otherSlotId }] })
      .expect(403);

    // Đơn giá riêng cần ca (contracts)
    await request(t.server)
      .post(`${API_PREFIX}/students`)
      .set(auth(teacherToken))
      .send({ students: [{ vietnameseName: 'Lê Dũng', classId, pricePerSession: 100_000 }] })
      .expect(400);
    expect(await t.prisma.user.count({ where: { studentProfile: { vietnameseName: 'Lê Dũng' } } })).toBe(0);
  });

  it('ADMIN thêm học sinh không cần lớp / ca', async () => {
    const res = await request(t.server)
      .post(`${API_PREFIX}/students`)
      .set(auth(adminToken))
      .send({ students: [{ vietnameseName: 'Phạm Em' }] })
      .expect(201);
    expect(res.body.items[0]).toMatchObject({ class: null, loginMode: 'MANAGED' });
  });
});
