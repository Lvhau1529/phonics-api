import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import {
  assignmentInclude,
  type AssignmentRow,
  rateInclude,
  type RateRowWithAuthor,
} from '@/modules/extra-lessons/types/extra.types';

type Db = Tx | PrismaService;

/** Lịch học thêm của học sinh (student_slot_assignments) + đơn giá (extra_rates) */
@Injectable()
export class ExtraScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  findStudent(id: string) {
    return this.prisma.user.findFirst({ where: { id, role: 'STUDENT' }, select: { id: true, status: true } });
  }

  // ---------- Lịch ----------

  /** Mọi dòng lịch của học sinh, mới nhất trước */
  assignmentsOf(studentId: string): Promise<AssignmentRow[]> {
    return this.prisma.studentSlotAssignment.findMany({
      where: { studentId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      include: assignmentInclude,
    });
  }

  findAssignment(id: string): Promise<AssignmentRow | null> {
    return this.prisma.studentSlotAssignment.findUnique({ where: { id }, include: assignmentInclude });
  }

  /** Các dòng cùng học sinh + ca (để kiểm tra chồng ngày) */
  sameSlotRanges(studentId: string, slotId: string, db: Db = this.prisma) {
    return db.studentSlotAssignment.findMany({
      where: { studentId, slotId },
      select: { id: true, effectiveFrom: true, effectiveTo: true },
    });
  }

  createAssignment(tx: Tx, data: Prisma.StudentSlotAssignmentUncheckedCreateInput): Promise<AssignmentRow> {
    return tx.studentSlotAssignment.create({ data, include: assignmentInclude });
  }

  updateAssignment(
    tx: Tx,
    id: string,
    data: Prisma.StudentSlotAssignmentUncheckedUpdateInput,
  ): Promise<AssignmentRow> {
    return tx.studentSlotAssignment.update({ where: { id }, data, include: assignmentInclude });
  }

  /** Học sinh từng / đang học một trong các ca này */
  async everInSlots(studentId: string, slotIds: readonly string[]): Promise<boolean> {
    if (!slotIds.length) return false;
    return !!(await this.prisma.studentSlotAssignment.findFirst({
      where: { studentId, slotId: { in: [...slotIds] } },
      select: { id: true },
    }));
  }

  /** Ca học sinh còn học tính từ ngày `date` (chưa kết thúc) */
  async openSlotIds(studentId: string, date: string): Promise<string[]> {
    const rows = await this.prisma.studentSlotAssignment.findMany({
      where: { studentId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] },
      select: { slotId: true },
      distinct: ['slotId'],
    });
    return rows.map((r) => r.slotId);
  }

  /** Lọc các buổi thuộc những ca này */
  async sessionsInSlots(sessionIds: readonly string[], slotIds: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.attendanceSession.findMany({
      where: { id: { in: [...sessionIds] }, slotId: { in: [...slotIds] } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // ---------- Đơn giá ----------

  findRate(id: string) {
    return this.prisma.extraRate.findUnique({
      where: { id },
      select: { id: true, studentId: true, slotId: true, effectiveFrom: true },
    });
  }

  /** Lịch sử một phạm vi giá, mới nhất trước */
  ratesOfScope(studentId: string | null, slotId: string | null): Promise<RateRowWithAuthor[]> {
    return this.prisma.extraRate.findMany({
      where: { studentId, slotId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      include: rateInclude,
    });
  }

  /** Mọi dòng giá riêng của học sinh (mọi ca), mới nhất trước */
  studentRates(studentId: string): Promise<RateRowWithAuthor[]> {
    return this.prisma.extraRate.findMany({
      where: { studentId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      include: rateInclude,
    });
  }

  /** Dòng giá liên quan để giải đơn giá: giá riêng các học sinh + giá mặc định các ca */
  ratesFor(studentIds: readonly string[], slotIds: readonly string[]) {
    return this.prisma.extraRate.findMany({
      where: {
        OR: [{ studentId: { in: [...studentIds] } }, { studentId: null, slotId: { in: [...slotIds] } }],
      },
    });
  }

  /** Khoá các dòng cùng phạm vi trước khi ghi giá mới (tránh hai người đặt giá cùng lúc) */
  async lockScope(tx: Tx, studentId: string | null, slotId: string | null) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`extra_rate:${studentId ?? '-'}:${slotId ?? '-'}`}))`;
    return tx.extraRate.findMany({
      where: { studentId, slotId },
      select: { id: true, effectiveFrom: true, effectiveTo: true },
    });
  }

  async setRateEnds(tx: Tx, changes: readonly { id: string; effectiveTo: string }[]): Promise<void> {
    for (const c of changes) {
      await tx.extraRate.update({ where: { id: c.id }, data: { effectiveTo: c.effectiveTo } });
    }
  }

  createRate(tx: Tx, data: Prisma.ExtraRateUncheckedCreateInput): Promise<RateRowWithAuthor> {
    return tx.extraRate.create({ data, include: rateInclude });
  }
}
