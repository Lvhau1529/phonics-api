/**
 * Học thêm: admin tạo ca + gán GV → GV chỉ thấy ca mình → GV đặt giá mặc định ca → xếp học sinh lớp mình vào ca
 * (chồng ngày bị chặn) → giá riêng học sinh thắng giá ca → học sinh học thêm ca của GV khác thì GV không đặt được giá
 * riêng → chuyển ca / rời ca → lưu trữ ca đóng lịch.
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
const FROM = '2026-01-05';

describe.skipIf(!enabled)('extra lessons (e2e)', () => {
  let t: TestApp;
  let adminToken: string;
  let teacherToken: string;
  let otherToken: string;
  let teacherId: string;
  let otherId: string;
  let studentId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function login(email: string) {
    return request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ email, password: PASSWORD });
  }

  async function createSlot(body: Record<string, unknown>): Promise<string> {
    const res = await request(t.server)
      .post(`${API_PREFIX}/extra-slots`)
      .set(auth(adminToken))
      .send(body)
      .expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    applyMigrations();
    t = await createTestApp();
    await truncateAll(t.prisma);
    const passwordHash = await new PasswordService().hash(PASSWORD);
    await t.prisma.user.create({
      data: { email: 'admin.extra@e2e.local', passwordHash, role: 'ADMIN', displayName: 'Admin' },
    });
    teacherId = (
      await t.prisma.user.create({
        data: { email: 'teacher.extra@e2e.local', passwordHash, role: 'TEACHER', displayName: 'Cô Hoa' },
      })
    ).id;
    otherId = (
      await t.prisma.user.create({
        data: { email: 'other.extra@e2e.local', passwordHash, role: 'TEACHER', displayName: 'Thầy Nam' },
      })
    ).id;
    const cls = await t.prisma.class.create({
      data: { name: 'EXTRA-K2', grade: 'K2', schoolYear: '2026-2027', teachers: { create: { teacherId } } },
    });
    studentId = (
      await t.prisma.user.create({
        data: {
          email: 'kid.extra@e2e.local',
          role: 'STUDENT',
          displayName: 'Andy',
          studentProfile: {
            create: {
              vietnameseName: 'Nguyễn Văn An',
              englishName: 'Andy',
              memberships: { create: { classId: cls.id } },
            },
          },
        },
      })
    ).id;
    adminToken = (await login('admin.extra@e2e.local')).body.accessToken;
    teacherToken = (await login('teacher.extra@e2e.local')).body.accessToken;
    otherToken = (await login('other.extra@e2e.local')).body.accessToken;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('ca, lịch học sinh, đơn giá theo phạm vi GV', async () => {
    const slotA = await createSlot({
      name: 'Phonics nâng cao — T3',
      weekday: 2,
      startTime: '18:00',
      endTime: '19:30',
      capacity: 10,
      teacherIds: [teacherId],
    });
    const slotB = await createSlot({
      name: 'Đọc — T5',
      weekday: 4,
      startTime: '18:00',
      endTime: '19:00',
      teacherIds: [otherId],
    });
    const slotC = await createSlot({
      name: 'Phonics — T7',
      weekday: 6,
      startTime: '09:00',
      endTime: '10:00',
      teacherIds: [teacherId],
    });

    // Giờ kết thúc phải sau giờ bắt đầu; GV tạo được ca (extra.manageSlots) và tự phụ trách ca đó
    await request(t.server)
      .post(`${API_PREFIX}/extra-slots`)
      .set(auth(adminToken))
      .send({ name: 'Sai giờ', weekday: 1, startTime: '18:00', endTime: '17:00' })
      .expect(400);
    const own = await request(t.server)
      .post(`${API_PREFIX}/extra-slots`)
      .set(auth(teacherToken))
      .send({ name: 'GV tạo', weekday: 1, startTime: '18:00', endTime: '19:00' })
      .expect(201);
    expect(own.body.teachers.map((x: { id: string }) => x.id)).toEqual([teacherId]);
    await request(t.server)
      .put(`${API_PREFIX}/extra-slots/${slotB}/teachers`)
      .set(auth(teacherToken))
      .send({ teacherIds: [teacherId] })
      .expect(403);

    const mine = await request(t.server).get(`${API_PREFIX}/extra-slots`).set(auth(teacherToken)).expect(200);
    expect(mine.body.items.map((s: { id: string }) => s.id).sort()).toEqual(
      [slotA, slotC, own.body.id].sort(),
    );
    // Ca GV tự tạo lưu trữ luôn để các bước sau (buổi theo thứ) không đổi
    await request(t.server)
      .delete(`${API_PREFIX}/extra-slots/${own.body.id}`)
      .set(auth(teacherToken))
      .expect(204);
    await request(t.server).get(`${API_PREFIX}/extra-slots/${slotB}`).set(auth(teacherToken)).expect(403);

    // GV đặt giá mặc định ca mình; không đặt được cho ca người khác
    await request(t.server)
      .post(`${API_PREFIX}/extra-slots/${slotA}/rates`)
      .set(auth(teacherToken))
      .send({ pricePerSession: 120_000, effectiveFrom: FROM })
      .expect(201);
    await request(t.server)
      .post(`${API_PREFIX}/extra-slots/${slotB}/rates`)
      .set(auth(teacherToken))
      .send({ pricePerSession: 1, effectiveFrom: FROM })
      .expect(403);

    // GV xếp học sinh lớp mình vào ca; chồng ngày bị chặn
    await request(t.server)
      .post(`${API_PREFIX}/students/${studentId}/slot-assignments`)
      .set(auth(teacherToken))
      .send({ slotId: slotA, effectiveFrom: FROM })
      .expect(201);
    const overlap = await request(t.server)
      .post(`${API_PREFIX}/students/${studentId}/slot-assignments`)
      .set(auth(teacherToken))
      .send({ slotId: slotA, effectiveFrom: '2026-03-01' })
      .expect(409);
    expect(overlap.body.code).toBe('SLOT_ASSIGNMENT_OVERLAP');

    const students = await request(t.server)
      .get(`${API_PREFIX}/extra-slots/${slotA}/students`)
      .set(auth(teacherToken))
      .expect(200);
    expect(students.body.items).toMatchObject([
      { studentId, englishName: 'Andy', rate: { pricePerSession: 120_000, source: 'SLOT' } },
    ]);
    const slotView = await request(t.server)
      .get(`${API_PREFIX}/extra-slots/${slotA}`)
      .set(auth(teacherToken))
      .expect(200);
    expect(slotView.body).toMatchObject({ studentCount: 1, defaultPrice: 120_000, capacity: 10 });

    // Giá riêng học sinh thắng giá ca
    await request(t.server)
      .post(`${API_PREFIX}/students/${studentId}/rates`)
      .set(auth(teacherToken))
      .send({ pricePerSession: 100_000, effectiveFrom: FROM })
      .expect(201);
    const afterRate = await request(t.server)
      .get(`${API_PREFIX}/extra-slots/${slotA}/students`)
      .set(auth(teacherToken))
      .expect(200);
    expect(afterRate.body.items[0].rate).toMatchObject({ pricePerSession: 100_000, source: 'STUDENT' });

    // Học sinh học thêm ca của GV khác → GV đầu không còn đặt được giá riêng (áp cho mọi ca)
    await request(t.server)
      .post(`${API_PREFIX}/students/${studentId}/slot-assignments`)
      .set(auth(adminToken))
      .send({ slotId: slotB, effectiveFrom: FROM })
      .expect(201);
    const forbidden = await request(t.server)
      .post(`${API_PREFIX}/students/${studentId}/rates`)
      .set(auth(teacherToken))
      .send({ pricePerSession: 90_000, effectiveFrom: '2026-02-01' })
      .expect(403);
    expect(forbidden.body.code).toBe('RATE_SCOPE_FORBIDDEN');
    const extra = await request(t.server)
      .get(`${API_PREFIX}/students/${studentId}/extra`)
      .set(auth(teacherToken))
      .expect(200);
    expect(extra.body).toMatchObject({ canManageSchedule: true, canManagePricing: false });
    expect(extra.body.assignments).toHaveLength(2);
    expect(extra.body.appliedRates).toEqual(
      expect.arrayContaining([
        { slotId: slotA, rate: expect.objectContaining({ source: 'STUDENT' }) },
        { slotId: slotB, rate: expect.objectContaining({ source: 'STUDENT' }) },
      ]),
    );
    // GV khác (chỉ dạy ca B) cũng xem được học sinh vì học ca mình
    await request(t.server)
      .get(`${API_PREFIX}/students/${studentId}/extra`)
      .set(auth(otherToken))
      .expect(200);

    // Admin đặt lại giá riêng từ cùng ngày → dòng cũ bị thay thế (effectiveTo = effectiveFrom)
    await request(t.server)
      .post(`${API_PREFIX}/students/${studentId}/rates`)
      .set(auth(adminToken))
      .send({ pricePerSession: 95_000, effectiveFrom: FROM, note: 'Nhập sai' })
      .expect(201);
    const rates = await request(t.server)
      .get(`${API_PREFIX}/students/${studentId}/rates`)
      .set(auth(adminToken))
      .expect(200);
    expect(
      rates.body.items.map((r: { pricePerSession: number; effectiveTo: string | null }) => [
        r.pricePerSession,
        r.effectiveTo,
      ]),
    ).toEqual([
      [95_000, null],
      [100_000, FROM],
    ]);

    // Chuyển ca A → C từ 01/03 (GV dạy cả hai), rồi cho rời ca C từ 01/06
    const rowA = extra.body.assignments.find((a: { slot: { id: string } }) => a.slot.id === slotA);
    const moved = await request(t.server)
      .post(`${API_PREFIX}/students/${studentId}/slot-assignments/${rowA.id}/move`)
      .set(auth(teacherToken))
      .send({ slotId: slotC, from: '2026-03-01' })
      .expect(201);
    expect(moved.body).toMatchObject({ slot: { id: slotC }, effectiveFrom: '2026-03-01', effectiveTo: null });
    await request(t.server)
      .patch(`${API_PREFIX}/students/${studentId}/slot-assignments/${moved.body.id}`)
      .set(auth(teacherToken))
      .send({ effectiveTo: '2026-06-01' })
      .expect(200);
    // GV không sửa được dòng của ca người khác
    const rowB = extra.body.assignments.find((a: { slot: { id: string } }) => a.slot.id === slotB);
    await request(t.server)
      .patch(`${API_PREFIX}/students/${studentId}/slot-assignments/${rowB.id}`)
      .set(auth(teacherToken))
      .send({ effectiveTo: '2026-06-01' })
      .expect(403);

    const history = await request(t.server)
      .get(`${API_PREFIX}/students/${studentId}/extra`)
      .set(auth(adminToken))
      .expect(200);
    expect(
      history.body.assignments.map(
        (a: { slot: { id: string }; effectiveFrom: string; effectiveTo: string | null }) => [
          a.slot.id,
          a.effectiveFrom,
          a.effectiveTo,
        ],
      ),
    ).toEqual(
      expect.arrayContaining([
        [slotA, FROM, '2026-03-01'],
        [slotC, '2026-03-01', '2026-06-01'],
        [slotB, FROM, null],
      ]),
    );

    // Lưu trữ ca B: lịch còn mở kết thúc từ hôm nay, ca không còn trong danh sách mặc định
    await request(t.server).delete(`${API_PREFIX}/extra-slots/${slotB}`).set(auth(adminToken)).expect(204);
    const closed = await t.prisma.studentSlotAssignment.findFirstOrThrow({ where: { slotId: slotB } });
    expect(closed.effectiveTo).not.toBeNull();
    const list = await request(t.server).get(`${API_PREFIX}/extra-slots`).set(auth(adminToken)).expect(200);
    expect(list.body.items.map((s: { id: string }) => s.id)).not.toContain(slotB);
  });
});
