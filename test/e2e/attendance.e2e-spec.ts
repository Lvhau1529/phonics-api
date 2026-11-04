/**
 * Điểm danh học thêm: tạo buổi của ngày từ lịch (mặc định có mặt, chốt giá) → GV điểm danh trong app → mail 21:00 →
 * duyệt nhanh bằng token → sửa lịch / đặt giá sau khi đã xác nhận (hỏi rồi áp) → điểm danh theo tháng → huỷ buổi
 * (khôi phục, báo nghỉ qua link mail),
 * buổi bù. Mốc 00:05 / 21:00 gọi thẳng service với `now` dựng sẵn (không chờ timer).
 * Cần DATABASE_URL_TEST (DB Postgres riêng, bị TRUNCATE); không có thì cả file skip.
 */
import { randomUUID } from 'node:crypto';
import { API_PREFIX, REFRESH_TRANSPORT_HEADER } from '@phonics/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayjs } from '@/core/time/dayjs';
import { PasswordService } from '@/modules/auth/services/password.service';
import { AttendanceDigestService } from '@/modules/extra-lessons/services/attendance-digest.service';
import { SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';
import {
  applyMigrations,
  createTestApp,
  type TestApp,
  truncateAll,
  useTestDatabase,
} from '../helpers/create-test-app';

const enabled = useTestDatabase();
const PASSWORD = 'Secret123!';
const TZ = 'Asia/Ho_Chi_Minh';
const FROM = '2026-01-05';

describe.skipIf(!enabled)('attendance (e2e)', () => {
  let t: TestApp;
  let adminToken: string;
  let teacherToken: string;
  let teacherId: string;
  let kidId: string;
  let guestId: string;
  let slotId: string;
  const today = dayjs().tz(TZ).format('YYYY-MM-DD');
  /** 23:00 hôm nay (giờ VN): đã qua 00:05 và 21:00, buổi 18:00 đã bắt đầu */
  const lateToday = dayjs.tz(`${today} 23:00`, TZ).toDate();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function login(email: string) {
    return request(t.server)
      .post(`${API_PREFIX}/auth/login`)
      .set(REFRESH_TRANSPORT_HEADER, 'body')
      .send({ email, password: PASSWORD });
  }

  async function student(email: string, name: string, classId: string): Promise<string> {
    const row = await t.prisma.user.create({
      data: {
        email,
        role: 'STUDENT',
        displayName: name,
        studentProfile: { create: { vietnameseName: name, memberships: { create: { classId } } } },
      },
    });
    return row.id;
  }

  beforeAll(async () => {
    applyMigrations();
    t = await createTestApp();
    await truncateAll(t.prisma);
    const passwordHash = await new PasswordService().hash(PASSWORD);
    await t.prisma.user.create({
      data: { email: 'admin.att@e2e.local', passwordHash, role: 'ADMIN', displayName: 'Admin' },
    });
    teacherId = (
      await t.prisma.user.create({
        data: { email: 'teacher.att@e2e.local', passwordHash, role: 'TEACHER', displayName: 'Cô Lan' },
      })
    ).id;
    const cls = await t.prisma.class.create({
      data: { name: 'ATT-K2', grade: 'K2', schoolYear: '2026-2027', teachers: { create: { teacherId } } },
    });
    kidId = await student('an.att@e2e.local', 'Nguyễn Văn An', cls.id);
    guestId = await student('binh.att@e2e.local', 'Trần Bình', cls.id);
    adminToken = (await login('admin.att@e2e.local')).body.accessToken;
    teacherToken = (await login('teacher.att@e2e.local')).body.accessToken;

    slotId = (
      await request(t.server)
        .post(`${API_PREFIX}/extra-slots`)
        .set(auth(adminToken))
        .send({
          name: 'Phonics tối',
          weekday: dayjs(today).isoWeekday(),
          startTime: '18:00',
          endTime: '19:30',
          teacherIds: [teacherId],
        })
        .expect(201)
    ).body.id;
    await request(t.server)
      .post(`${API_PREFIX}/extra-slots/${slotId}/rates`)
      .set(auth(teacherToken))
      .send({ pricePerSession: 120_000, effectiveFrom: FROM })
      .expect(201);
    await request(t.server)
      .post(`${API_PREFIX}/students/${kidId}/slot-assignments`)
      .set(auth(teacherToken))
      .send({ slotId, effectiveFrom: FROM })
      .expect(201);
  });

  afterAll(async () => {
    await t?.close();
  });

  it('tạo buổi → điểm danh → mail 21:00 → duyệt bằng token → sửa lịch / giá sau xác nhận', async () => {
    const sync = t.app.get(SessionSyncService);
    await sync.ensureSessions(lateToday);
    expect(await sync.ensureSessions(lateToday)).toBe(0); // idempotent

    const list = await request(t.server)
      .get(`${API_PREFIX}/attendance/sessions`)
      .query({ from: today, to: today })
      .set(auth(teacherToken))
      .expect(200);
    expect(list.body.items).toMatchObject([
      { date: today, status: 'PENDING', studentCount: 1, presentCount: 1, slot: { id: slotId } },
    ]);
    const sessionId: string = list.body.items[0].id;

    // GV đánh vắng An (không tính phí), thêm Bình học bù (MANUAL, giá mặc định ca)
    const edited = await request(t.server)
      .put(`${API_PREFIX}/attendance/sessions/${sessionId}/records`)
      .set(auth(teacherToken))
      .send({ records: [{ studentId: kidId, mark: 'ABSENT' }, { studentId: guestId }] })
      .expect(200);
    expect(edited.body).toMatchObject({
      presentCount: 1,
      studentCount: 2,
      canEdit: true,
      canEditBilling: false,
    });
    expect(edited.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: kidId, mark: 'ABSENT', charged: false, source: 'SNAPSHOT' }),
        expect.objectContaining({
          studentId: guestId,
          mark: 'PRESENT',
          charged: true,
          unitPrice: 120_000,
          source: 'MANUAL',
        }),
      ]),
    );
    await request(t.server)
      .put(`${API_PREFIX}/attendance/sessions/${sessionId}/records`)
      .set(auth(teacherToken))
      .send({ records: [{ studentId: kidId, charged: true }] })
      .expect(403);

    // 21:00: một mail cho GV, link token xem được không cần đăng nhập
    const digests = t.app.get(AttendanceDigestService);
    expect(await digests.sendDigests(lateToday)).toBe(1);
    expect(await digests.sendDigests(lateToday)).toBe(0); // một mail / GV / ngày
    const mail = await t.prisma.mailOutbox.findFirstOrThrow({ where: { kind: 'teacher.digest' } });
    expect(mail.toEmail).toBe('teacher.att@e2e.local');
    const token = /\/a\/attendance\/([\w-]+)/.exec(mail.text)?.[1];
    expect(token).toBeDefined();
    const view = await request(t.server).get(`${API_PREFIX}/attendance/public/digests/${token}`).expect(200);
    expect(view.body).toMatchObject({
      teacherName: 'Cô Lan',
      sessions: [{ id: sessionId, status: 'PENDING', changed: false, presentCount: 1, studentCount: 2 }],
    });

    const confirmed = await request(t.server)
      .post(`${API_PREFIX}/attendance/public/digests/${token}/confirm`)
      .send({ sessionIds: [sessionId] })
      .expect(200);
    expect(confirmed.body).toMatchObject({ confirmed: [sessionId], alreadyConfirmed: [], rejected: [] });
    const again = await request(t.server)
      .post(`${API_PREFIX}/attendance/public/digests/${token}/confirm`)
      .send({ sessionIds: [sessionId] })
      .expect(200);
    expect(again.body).toMatchObject({ confirmed: [], alreadyConfirmed: [sessionId] });
    await request(t.server).get(`${API_PREFIX}/attendance/public/digests/not-a-token`).expect(404);

    const detail = await request(t.server)
      .get(`${API_PREFIX}/attendance/sessions/${sessionId}`)
      .set(auth(teacherToken))
      .expect(200);
    expect(detail.body).toMatchObject({
      status: 'CONFIRMED',
      confirmedVia: 'EMAIL',
      confirmedBy: { id: teacherId },
    });

    // Sửa lịch An: nghỉ ca từ 06/01 → buổi hôm nay (đã xác nhận) lệch, hỏi rồi áp
    const extra = await request(t.server)
      .get(`${API_PREFIX}/students/${kidId}/extra`)
      .set(auth(teacherToken))
      .expect(200);
    const left = await request(t.server)
      .patch(`${API_PREFIX}/students/${kidId}/slot-assignments/${extra.body.assignments[0].id}`)
      .set(auth(teacherToken))
      .send({ effectiveTo: '2026-01-06' })
      .expect(200);
    expect(left.body.affectedSessions).toEqual([
      { sessionId, date: today, slotName: 'Phonics tối', change: 'REMOVE' },
    ]);
    const appliedSchedule = await request(t.server)
      .post(`${API_PREFIX}/students/${kidId}/slot-assignments/apply`)
      .set(auth(teacherToken))
      .send({ sessionIds: [sessionId] })
      .expect(200);
    expect(appliedSchedule.body).toEqual({ updated: [sessionId] });

    // Giá riêng cho Bình (admin) → bản ghi đã xác nhận lệch giá, hỏi rồi áp
    const rate = await request(t.server)
      .post(`${API_PREFIX}/students/${guestId}/rates`)
      .set(auth(adminToken))
      .send({ pricePerSession: 100_000, effectiveFrom: FROM })
      .expect(201);
    expect(rate.body.affectedRecords).toEqual([
      { sessionId, studentId: guestId, date: today, oldPrice: 120_000, newPrice: 100_000, charged: true },
    ]);
    await request(t.server)
      .post(`${API_PREFIX}/extra-rates/${rate.body.id}/apply`)
      .set(auth(adminToken))
      .send({ sessionIds: [sessionId] })
      .expect(200);

    const after = await request(t.server)
      .get(`${API_PREFIX}/attendance/sessions/${sessionId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(after.body.records).toEqual([
      expect.objectContaining({ studentId: guestId, unitPrice: 100_000, missingRate: false }),
    ]);
    expect(after.body.status).toBe('CONFIRMED');

    const month = await request(t.server)
      .get(`${API_PREFIX}/students/${guestId}/attendance`)
      .query({ month: today.slice(0, 7) })
      .set(auth(adminToken))
      .expect(200);
    expect(month.body).toMatchObject({
      items: [{ sessionId, mark: 'PRESENT', charged: true, unitPrice: 100_000, source: 'MANUAL' }],
      chargedTotal: 100_000,
    });

    // Huỷ buổi → không sửa được; huỷ cả một ngày chưa có buổi → tạo buổi đã huỷ
    const cancelled = await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions/cancel`)
      .set(auth(adminToken))
      .send({ sessionIds: [sessionId], reason: 'Nghỉ lễ' })
      .expect(200);
    expect(cancelled.body).toEqual({ cancelled: [sessionId] });
    const blocked = await request(t.server)
      .put(`${API_PREFIX}/attendance/sessions/${sessionId}/records`)
      .set(auth(teacherToken))
      .send({ records: [{ studentId: guestId, mark: 'ABSENT' }] })
      .expect(409);
    expect(blocked.body.code).toBe('ATTENDANCE_SESSION_CANCELLED');
    const nextWeek = dayjs(today).add(7, 'day').format('YYYY-MM-DD');
    const holiday = await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions/cancel`)
      .set(auth(adminToken))
      .send({ date: nextWeek, reason: 'Nghỉ lễ' })
      .expect(200);
    expect(holiday.body.cancelled).toHaveLength(1);
    expect(await t.prisma.attendanceSession.findFirst({ where: { date: nextWeek } })).toMatchObject({
      status: 'CANCELLED',
      slotId,
    });

    // Khôi phục: buổi huỷ sẵn (chưa có HS) → PENDING + chụp danh sách từ lịch hiện tại; khôi phục lần nữa → 409
    const holidayId = holiday.body.cancelled[0] as string;
    const restoredHoliday = await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions/${holidayId}/restore`)
      .set(auth(teacherToken))
      .expect(200);
    // An đã rời ca từ 06/01 → lịch hiện tại không còn ai, danh sách chụp lại rỗng (chụp có HS: unit test writer)
    expect(restoredHoliday.body).toMatchObject({ status: 'PENDING', cancelReason: null, records: [] });
    await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions/${holidayId}/restore`)
      .set(auth(teacherToken))
      .expect(409);
    // Buổi đã xác nhận rồi huỷ → khôi phục giữ danh sách, xoá thông tin xác nhận cũ
    const restored = await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions/${sessionId}/restore`)
      .set(auth(adminToken))
      .expect(200);
    expect(restored.body).toMatchObject({ status: 'PENDING', confirmedAt: null, confirmedBy: null });
    expect(restored.body.records.map((r: { studentId: string }) => r.studentId)).toContain(guestId);

    // GV báo nghỉ qua link mail: buổi còn chờ (dù danh sách đã đổi) → huỷ; lần hai → đã huỷ
    const off = await request(t.server)
      .post(`${API_PREFIX}/attendance/public/digests/${token}/cancel`)
      .send({ sessionIds: [sessionId], reason: 'GV ốm' })
      .expect(200);
    expect(off.body).toMatchObject({ cancelled: [sessionId], alreadyCancelled: [], rejected: [] });
    expect(off.body.digest.sessions[0]).toMatchObject({ id: sessionId, status: 'CANCELLED' });
    const offAgain = await request(t.server)
      .post(`${API_PREFIX}/attendance/public/digests/${token}/cancel`)
      .send({ sessionIds: [sessionId, randomUUID()], reason: 'GV ốm' })
      .expect(200);
    expect(offAgain.body).toMatchObject({ cancelled: [], alreadyCancelled: [sessionId] });
    expect(offAgain.body.rejected).toHaveLength(1);
    expect(await t.prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'GV ốm',
    });

    // Buổi bù (admin), thêm học sinh tay
    const makeup = await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions`)
      .set(auth(adminToken))
      .send({ date: today, startTime: '08:00', endTime: '09:00', teacherIds: [teacherId] })
      .expect(201);
    expect(makeup.body).toMatchObject({ slot: null, status: 'PENDING', records: [] });
    // GV (extra.manageSlots) tạo buổi bù được, nhưng phải có mình phụ trách
    await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions`)
      .set(auth(teacherToken))
      .send({ date: today, startTime: '08:00', endTime: '09:00', teacherIds: [teacherId] })
      .expect(201);
    const notMine = await request(t.server)
      .post(`${API_PREFIX}/attendance/sessions`)
      .set(auth(teacherToken))
      .send({ date: today, startTime: '08:00', endTime: '09:00', teacherIds: [randomUUID()] })
      .expect(400);
    expect(notMine.body.details).toHaveProperty('teacherIds');
  });
});
