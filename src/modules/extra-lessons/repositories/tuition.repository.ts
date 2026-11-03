import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import {
  type StatementRecordRow,
  type StatementStudentRow,
} from '@/modules/extra-lessons/utils/tuition-statement';

/** Số liệu tiền học của một nhóm bản ghi (chưa có tháng / ca / học sinh) */
export interface TuitionAgg {
  confirmedTotal: number;
  pendingTotal: number;
  chargedCount: number;
  presentCount: number;
  absentCount: number;
  excusedCount: number;
  studentCount: number;
}

/** Khoảng ngày 'YYYY-MM-DD' nửa mở [from, to) + lọc học sinh (tuỳ chọn) */
export interface TuitionScope {
  from: string;
  to: string;
  studentId?: string;
}

// Không tính buổi huỷ; tổng tiền chỉ bản ghi tính phí. SUM ra bigint → float8 để Prisma trả number.
const AGG = Prisma.sql`
  COALESCE(SUM(r.unit_price) FILTER (WHERE r.charged AND s.status = 'CONFIRMED'), 0)::float8 AS "confirmedTotal",
  COALESCE(SUM(r.unit_price) FILTER (WHERE r.charged AND s.status = 'PENDING'), 0)::float8   AS "pendingTotal",
  COUNT(*) FILTER (WHERE r.charged)::int            AS "chargedCount",
  COUNT(*) FILTER (WHERE r.mark = 'PRESENT')::int   AS "presentCount",
  COUNT(*) FILTER (WHERE r.mark = 'ABSENT')::int    AS "absentCount",
  COUNT(*) FILTER (WHERE r.mark = 'EXCUSED')::int   AS "excusedCount",
  COUNT(DISTINCT r.student_id)::int                 AS "studentCount"`;

/** Thống kê học phí tạm tính từ bản ghi điểm danh (đơn giá đã chốt trên từng bản ghi) */
@Injectable()
export class TuitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private where(scope: TuitionScope): Prisma.Sql {
    const student = scope.studentId ? Prisma.sql`AND r.student_id = ${scope.studentId}::uuid` : Prisma.empty;
    return Prisma.sql`WHERE s.status <> 'CANCELLED' AND s.date >= ${scope.from} AND s.date < ${scope.to} ${student}`;
  }

  byMonth(scope: TuitionScope): Promise<(TuitionAgg & { month: string })[]> {
    return this.prisma.$queryRaw`
      SELECT substr(s.date, 1, 7) AS month, ${AGG}
      FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
      ${this.where(scope)}
      GROUP BY 1 ORDER BY 1`;
  }

  /** Một dòng tổng của cả khoảng (số học sinh khác nhau) */
  total(scope: TuitionScope): Promise<TuitionAgg[]> {
    return this.prisma.$queryRaw`
      SELECT ${AGG}
      FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
      ${this.where(scope)}`;
  }

  bySlot(scope: TuitionScope): Promise<(TuitionAgg & { slotId: string | null; slotName: string | null })[]> {
    return this.prisma.$queryRaw`
      SELECT s.slot_id AS "slotId", MAX(x.name) AS "slotName", ${AGG}
      FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
      LEFT JOIN extra_slots x ON x.id = s.slot_id
      ${this.where(scope)}
      GROUP BY s.slot_id
      ORDER BY SUM(r.unit_price) FILTER (WHERE r.charged) DESC NULLS LAST`;
  }

  topStudents(
    scope: TuitionScope,
    limit: number,
  ): Promise<(TuitionAgg & { studentId: string; displayName: string })[]> {
    return this.prisma.$queryRaw`
      SELECT r.student_id AS "studentId", MAX(u.display_name) AS "displayName", ${AGG}
      FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
      JOIN users u ON u.id = r.student_id
      ${this.where(scope)}
      GROUP BY r.student_id
      ORDER BY SUM(r.unit_price) FILTER (WHERE r.charged) DESC NULLS LAST, 2
      LIMIT ${limit}`;
  }

  /** `zeroPriceRecords`: lượt tính phí chưa có dòng giá nào (thiếu giá) — đặt giá 0đ là miễn phí, không cảnh báo */
  async warnings(scope: TuitionScope): Promise<{ pendingSessions: number; zeroPriceRecords: number }> {
    const [row] = await this.prisma.$queryRaw<[{ pendingSessions: number; zeroPriceRecords: number }]>`
      SELECT
        (SELECT COUNT(*) FROM attendance_sessions s
          WHERE s.status = 'PENDING' AND s.date >= ${scope.from} AND s.date < ${scope.to})::int AS "pendingSessions",
        (SELECT COUNT(*) FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
          ${this.where(scope)} AND r.charged AND r.unit_price = 0 AND r.rate_id IS NULL)::int AS "zeroPriceRecords"`;
    return row;
  }

  // ----- Phiếu báo học phí (gộp các bé cùng phụ huynh nhận học phí) -----

  /** Phụ huynh nhận học phí của bé (chưa xoá) */
  async billingGuardian(
    studentId: string,
  ): Promise<{ id: string; fullName: string; phone: string | null } | null> {
    const link = await this.prisma.studentGuardian.findFirst({
      where: { studentId, isBillingContact: true, guardian: { deletedAt: null } },
      select: { guardian: { select: { id: true, fullName: true, phone: true } } },
    });
    return link?.guardian ?? null;
  }

  /** Các bé (chưa xoá) mà phụ huynh này nhận học phí, sắp theo tên */
  async billedStudents(guardianId: string): Promise<StatementStudentRow[]> {
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, isBillingContact: true, student: { user: { deletedAt: null } } },
      select: { student: { select: { userId: true, vietnameseName: true, englishName: true } } },
      orderBy: { student: { nameSortKey: 'asc' } },
    });
    return links.map(({ student: s }) => ({
      id: s.userId,
      vietnameseName: s.vietnameseName,
      englishName: s.englishName,
    }));
  }

  async statementStudent(studentId: string): Promise<StatementStudentRow | null> {
    const s = await this.prisma.studentProfile.findFirst({
      where: { userId: studentId, user: { deletedAt: null } },
      select: { userId: true, vietnameseName: true, englishName: true },
    });
    return s && { id: s.userId, vietnameseName: s.vietnameseName, englishName: s.englishName };
  }

  /** Bản ghi điểm danh của các bé trong khoảng ngày nửa mở (không tính buổi huỷ) */
  statementRecords(
    studentIds: readonly string[],
    range: { from: string; to: string },
  ): Promise<StatementRecordRow[]> {
    return this.prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: [...studentIds] },
        session: { status: { not: 'CANCELLED' }, date: { gte: range.from, lt: range.to } },
      },
      select: {
        studentId: true,
        mark: true,
        charged: true,
        unitPrice: true,
        session: {
          select: {
            date: true,
            startTime: true,
            endTime: true,
            status: true,
            kind: true,
            slot: { select: { name: true, kind: true, startTime: true, endTime: true } },
          },
        },
      },
    });
  }
}
