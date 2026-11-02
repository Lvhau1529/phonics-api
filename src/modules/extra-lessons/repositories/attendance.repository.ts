import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import {
  sessionDetailInclude,
  type SessionDetailRow,
  sessionSummaryInclude,
  type SessionSummaryRow,
  type TeacherRow,
} from '@/modules/extra-lessons/types/extra.types';

type Db = Tx | PrismaService;

/** Buổi học thêm, bản ghi điểm danh, mail tổng hợp 21:00 */
@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // ---------- Đọc ----------

  list(
    where: Prisma.AttendanceSessionWhereInput,
    page: { skip: number; take: number },
    orderBy: Prisma.AttendanceSessionOrderByWithRelationInput[],
  ): Promise<SessionSummaryRow[]> {
    return this.prisma.attendanceSession.findMany({
      where,
      ...page,
      orderBy,
      include: sessionSummaryInclude,
    });
  }

  count(where: Prisma.AttendanceSessionWhereInput): Promise<number> {
    return this.prisma.attendanceSession.count({ where });
  }

  findById(id: string, db: Db = this.prisma): Promise<SessionDetailRow | null> {
    return db.attendanceSession.findUnique({ where: { id }, include: sessionDetailInclude });
  }

  /** Số bản ghi thiếu đơn giá theo buổi */
  async missingRateCounts(sessionIds: readonly string[]): Promise<Map<string, number>> {
    if (!sessionIds.length) return new Map();
    const rows = await this.prisma.attendanceRecord.groupBy({
      by: ['sessionId'],
      where: { sessionId: { in: [...sessionIds] }, rateId: null },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.sessionId, r._count._all]));
  }

  teachers(ids: readonly string[]): Promise<TeacherRow[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, displayName: true, email: true, avatarKey: true },
    });
  }

  /** Bản ghi của học sinh trong [from, to) kèm buổi */
  studentRecords(studentId: string, from: string, to: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { studentId, session: { date: { gte: from, lt: to } } },
      orderBy: [{ session: { date: 'asc' } }, { session: { startTime: 'asc' } }],
      include: {
        session: {
          select: { id: true, date: true, startTime: true, status: true, slot: { select: { name: true } } },
        },
      },
    });
  }

  // ---------- Tạo buổi (00:05) ----------

  /** Ca còn hoạt động dạy vào thứ `weekday`, tạo trước cuối ngày đó */
  /** `teacherId`: chỉ ca GV đó dạy */
  slotsOnWeekday(weekday: number, createdBefore: Date, teacherId?: string) {
    return this.prisma.extraSlot.findMany({
      where: {
        weekday,
        archivedAt: null,
        createdAt: { lt: createdBefore },
        teachers: teacherId ? { some: { teacherId } } : undefined,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        teachers: { select: { teacherId: true } },
      },
    });
  }

  /** Ca đã có buổi trong các ngày này */
  async existingSlotDates(slotIds: readonly string[], dates: readonly string[]): Promise<Set<string>> {
    if (!slotIds.length) return new Set();
    const rows = await this.prisma.attendanceSession.findMany({
      where: { slotId: { in: [...slotIds] }, date: { in: [...dates] } },
      select: { slotId: true, date: true },
    });
    return new Set(rows.map((r) => `${r.slotId}:${r.date}`));
  }

  /** Học sinh (ACTIVE) theo lịch của ca tại ngày */
  async rosterOf(slotId: string, date: string): Promise<string[]> {
    const rows = await this.prisma.studentSlotAssignment.findMany({
      where: {
        slotId,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
        student: { user: { status: 'ACTIVE' } },
      },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    return rows.map((r) => r.studentId);
  }

  createSession(tx: Tx, data: Prisma.AttendanceSessionUncheckedCreateInput): Promise<{ id: string }> {
    return tx.attendanceSession.create({ data, select: { id: true } });
  }

  async hasActiveSlots(): Promise<boolean> {
    return !!(await this.prisma.extraSlot.findFirst({ where: { archivedAt: null }, select: { id: true } }));
  }

  async hasPendingSessions(): Promise<boolean> {
    return !!(await this.prisma.attendanceSession.findFirst({
      where: { status: 'PENDING' },
      select: { id: true },
    }));
  }

  // ---------- Sửa điểm danh ----------

  async upsertRecord(
    tx: Tx,
    sessionId: string,
    studentId: string,
    create: Omit<Prisma.AttendanceRecordUncheckedCreateInput, 'sessionId' | 'studentId'>,
    update: Prisma.AttendanceRecordUncheckedUpdateInput,
  ): Promise<void> {
    await tx.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId, studentId } },
      create: { ...create, sessionId, studentId },
      update,
    });
  }

  async deleteRecords(
    tx: Tx,
    sessionId: string,
    studentIds: readonly string[],
    source?: string,
  ): Promise<number> {
    const { count } = await tx.attendanceRecord.deleteMany({
      where: { sessionId, studentId: { in: [...studentIds] }, source },
    });
    return count;
  }

  async updateRecord(
    tx: Tx,
    sessionId: string,
    studentId: string,
    data: Prisma.AttendanceRecordUncheckedUpdateInput,
  ): Promise<void> {
    await tx.attendanceRecord.update({ where: { sessionId_studentId: { sessionId, studentId } }, data });
  }

  /** Sau khi sửa bản ghi: đếm lại có mặt + tăng recordsVersion */
  async touchSession(
    tx: Tx,
    id: string,
    data: Prisma.AttendanceSessionUncheckedUpdateInput = {},
  ): Promise<void> {
    const present = await tx.attendanceRecord.count({ where: { sessionId: id, mark: 'PRESENT' } });
    await tx.attendanceSession.update({
      where: { id },
      data: { ...data, presentCount: present, recordsVersion: { increment: 1 } },
    });
  }

  /** Xác nhận có điều kiện (còn PENDING, đúng version nếu truyền) — false nếu người khác xử lý trước / danh sách đã đổi */
  async confirm(
    id: string,
    by: { userId: string; at: Date; via: 'APP' | 'EMAIL' },
    expectedVersion?: number,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const { count } = await db.attendanceSession.updateMany({
      where: { id, status: 'PENDING', recordsVersion: expectedVersion },
      data: { status: 'CONFIRMED', confirmedById: by.userId, confirmedAt: by.at, confirmedVia: by.via },
    });
    return count === 1;
  }

  /** Xác nhận lại sau khi sửa buổi đã xác nhận (ghi người / lúc mới) */
  async reconfirm(id: string, by: { userId: string; at: Date }): Promise<void> {
    await this.prisma.attendanceSession.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { confirmedById: by.userId, confirmedAt: by.at, confirmedVia: 'APP' },
    });
  }

  /** `teacherId`: chỉ buổi GV đó phụ trách */
  findCancellable(ids: readonly string[], teacherId?: string) {
    return this.prisma.attendanceSession.findMany({
      where: {
        id: { in: [...ids] },
        status: { not: 'CANCELLED' },
        teacherIds: teacherId ? { has: teacherId } : undefined,
      },
      select: { id: true },
    });
  }

  findByDate(date: string, teacherId?: string) {
    return this.prisma.attendanceSession.findMany({
      where: { date, status: { not: 'CANCELLED' }, teacherIds: teacherId ? { has: teacherId } : undefined },
      select: { id: true },
    });
  }

  async cancel(tx: Tx, ids: readonly string[], reason: string): Promise<void> {
    await tx.attendanceSession.updateMany({
      where: { id: { in: [...ids] } },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
  }

  // ---------- Đồng bộ với lịch / giá ----------

  /** Buổi (chưa huỷ) của các ca trong khoảng ngày, kèm bản ghi của học sinh */
  sessionsForStudent(studentId: string, slotIds: readonly string[], from: string, to: string | null) {
    return this.prisma.attendanceSession.findMany({
      where: {
        slotId: { in: [...slotIds] },
        status: { not: 'CANCELLED' },
        date: { gte: from, ...(to ? { lt: to } : {}) },
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        slotId: true,
        date: true,
        status: true,
        slot: { select: { name: true } },
        records: { where: { studentId }, select: { studentId: true, source: true } },
      },
    });
  }

  findSessionsWithStudent(ids: readonly string[], studentId: string) {
    return this.prisma.attendanceSession.findMany({
      where: { id: { in: [...ids] }, status: { not: 'CANCELLED' } },
      select: {
        id: true,
        slotId: true,
        date: true,
        status: true,
        slot: { select: { name: true } },
        records: { where: { studentId }, select: { studentId: true, source: true } },
      },
    });
  }

  /** Bản ghi có thể đổi giá: buổi chưa huỷ, từ ngày `from` */
  recordsForReprice(where: Prisma.AttendanceRecordWhereInput) {
    return this.prisma.attendanceRecord.findMany({
      where: { ...where, session: { ...(where.session as object), status: { not: 'CANCELLED' } } },
      select: {
        sessionId: true,
        studentId: true,
        unitPrice: true,
        rateId: true,
        charged: true,
        session: { select: { date: true, slotId: true, status: true } },
      },
    });
  }

  // ---------- Mail 21:00 ----------

  /** Buổi chờ xác nhận tới ngày `date`, đã bắt đầu, chưa nhắc quá `maxDigests` lần */
  pendingForDigest(date: string, now: Date, maxDigests: number) {
    return this.prisma.attendanceSession.findMany({
      where: {
        status: 'PENDING',
        date: { lte: date },
        startsAt: { lte: now },
        digestCount: { lt: maxDigests },
      },
      orderBy: [{ date: 'asc' }, { startsAt: 'asc' }],
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        teacherIds: true,
        presentCount: true,
        recordsVersion: true,
        slot: { select: { name: true } },
        _count: { select: { records: true } },
      },
    });
  }

  async digestExists(teacherId: string, date: string): Promise<boolean> {
    return !!(await this.prisma.attendanceDigest.findUnique({
      where: { teacherId_date: { teacherId, date } },
      select: { id: true },
    }));
  }

  createDigest(tx: Tx, data: Prisma.AttendanceDigestUncheckedCreateInput): Promise<{ id: string }> {
    return tx.attendanceDigest.create({ data, select: { id: true } });
  }

  async bumpDigestCount(tx: Tx, ids: readonly string[]): Promise<void> {
    await tx.attendanceSession.updateMany({
      where: { id: { in: [...ids] } },
      data: { digestCount: { increment: 1 } },
    });
  }

  findDigest(tokenHash: string) {
    return this.prisma.attendanceDigest.findUnique({
      where: { tokenHash },
      include: { teacher: { select: { id: true, displayName: true } } },
    });
  }

  digestSessions(ids: readonly string[]) {
    return this.prisma.attendanceSession.findMany({
      where: { id: { in: [...ids] } },
      orderBy: [{ date: 'asc' }, { startsAt: 'asc' }],
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        presentCount: true,
        recordsVersion: true,
        confirmedAt: true,
        slot: { select: { name: true } },
        confirmedBy: { select: { displayName: true } },
        _count: { select: { records: true } },
      },
    });
  }
}
