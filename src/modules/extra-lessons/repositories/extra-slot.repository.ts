import { Injectable } from '@nestjs/common';
import { type ExtraSlotKind } from '@phonics/contracts';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import {
  slotInclude,
  type SlotRow,
  slotStudentInclude,
  type SlotStudentRow,
} from '@/modules/extra-lessons/types/extra.types';

type Db = Tx | PrismaService;

/** Ca học thêm: ca, GV của ca, học sinh của ca tại một ngày */
@Injectable()
export class ExtraSlotRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  list(where: Prisma.ExtraSlotWhereInput): Promise<SlotRow[]> {
    return this.prisma.extraSlot.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { name: 'asc' }],
      include: slotInclude,
    });
  }

  findById(id: string, db: Db = this.prisma): Promise<SlotRow | null> {
    return db.extraSlot.findUnique({ where: { id }, include: slotInclude });
  }

  create(tx: Tx, data: Prisma.ExtraSlotUncheckedCreateInput): Promise<SlotRow> {
    return tx.extraSlot.create({ data, include: slotInclude });
  }

  update(tx: Tx, id: string, data: Prisma.ExtraSlotUncheckedUpdateInput): Promise<SlotRow> {
    return tx.extraSlot.update({ where: { id }, data, include: slotInclude });
  }

  /** Buổi đã tạo của ca từ ngày `from` (để đổi giờ theo ca) */
  sessionsFrom(tx: Tx, slotId: string, from: string): Promise<{ id: string; date: string }[]> {
    return tx.attendanceSession.findMany({
      where: { slotId, date: { gte: from } },
      select: { id: true, date: true },
    });
  }

  /** Đổi loại ca của các buổi đã tạo của ca từ ngày `from` → số buổi đổi */
  async updateSessionKind(tx: Tx, slotId: string, from: string, kind: ExtraSlotKind): Promise<number> {
    const { count } = await tx.attendanceSession.updateMany({
      where: { slotId, date: { gte: from }, kind: { not: kind } },
      data: { kind },
    });
    return count;
  }

  async updateSessionTime(
    tx: Tx,
    id: string,
    data: { startTime: string; endTime: string; startsAt: Date; endsAt: Date },
  ): Promise<void> {
    await tx.attendanceSession.update({ where: { id }, data });
  }

  async setTeachers(tx: Tx, slotId: string, teacherIds: readonly string[]): Promise<void> {
    await tx.extraSlotTeacher.deleteMany({ where: { slotId } });
    if (teacherIds.length) {
      await tx.extraSlotTeacher.createMany({ data: teacherIds.map((teacherId) => ({ slotId, teacherId })) });
    }
  }

  /** Số id là giáo viên (để kiểm tra danh sách GV gửi lên) */
  countTeachers(ids: readonly string[]): Promise<number> {
    return this.prisma.user.count({ where: { id: { in: [...ids] }, role: 'TEACHER', deletedAt: null } });
  }

  findClass(id: string) {
    return this.prisma.class.findUnique({ where: { id }, select: { id: true } });
  }

  /** Id các ca GV dạy */
  async teacherSlotIds(teacherId: string): Promise<string[]> {
    const rows = await this.prisma.extraSlotTeacher.findMany({
      where: { teacherId },
      select: { slotId: true },
    });
    return rows.map((r) => r.slotId);
  }

  /** Số học sinh đang học từng ca tại ngày `date` */
  async countStudentsOn(slotIds: readonly string[], date: string): Promise<Map<string, number>> {
    if (!slotIds.length) return new Map();
    const rows = await this.prisma.studentSlotAssignment.groupBy({
      by: ['slotId'],
      where: {
        slotId: { in: [...slotIds] },
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.slotId, r._count._all]));
  }

  studentsOn(slotId: string, date: string): Promise<SlotStudentRow[]> {
    return this.prisma.studentSlotAssignment.findMany({
      where: {
        slotId,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
      },
      orderBy: { student: { nameSortKey: 'asc' } },
      include: slotStudentInclude,
    });
  }

  /** Huỷ buổi chưa xác nhận của ca từ ngày `from` — trả số buổi đã huỷ */
  async cancelPendingFrom(tx: Tx, slotId: string, from: string, reason: string): Promise<number> {
    const { count } = await tx.attendanceSession.updateMany({
      where: { slotId, date: { gte: from }, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
    return count;
  }

  /** Ngày đã huỷ sẵn từ `from` của từng ca (để tính buổi kế tiếp) */
  async cancelledDates(slotIds: readonly string[], from: string): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    if (!slotIds.length) return out;
    const rows = await this.prisma.attendanceSession.findMany({
      where: { slotId: { in: [...slotIds] }, date: { gte: from }, status: 'CANCELLED' },
      select: { slotId: true, date: true },
    });
    for (const r of rows)
      if (r.slotId) (out.get(r.slotId) ?? out.set(r.slotId, new Set()).get(r.slotId)!).add(r.date);
    return out;
  }

  /** Ca tới ngày ngừng (`endsOn` ≤ `today`) mà chưa chuyển sang đã ngừng */
  endedSlots(today: string): Promise<{ id: string; endsOn: string | null }[]> {
    return this.prisma.extraSlot.findMany({
      where: { archivedAt: null, endsOn: { lte: today } },
      select: { id: true, endsOn: true },
    });
  }

  /** Ngừng ca: các dòng lịch còn mở kết thúc tại `date` (dòng chưa bắt đầu thì bỏ hẳn) */
  async closeAssignments(tx: Tx, slotId: string, date: string): Promise<number> {
    await tx.studentSlotAssignment.deleteMany({ where: { slotId, effectiveFrom: { gte: date } } });
    const { count } = await tx.studentSlotAssignment.updateMany({
      where: { slotId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] },
      data: { effectiveTo: date },
    });
    return count;
  }
}
