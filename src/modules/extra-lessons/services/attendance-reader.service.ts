import { Injectable } from '@nestjs/common';
import {
  ATTENDANCE_SORT_FIELDS,
  type AttendanceSessionDetail,
  type AttendanceSessionListQuery,
  type AttendanceSessionSummary,
  type Paginated,
  type PendingCountResponse,
  type StudentAttendanceQuery,
  type StudentAttendanceResponse,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { orderBy, paginate } from '@/common/utils/paginate';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toAttendanceRecord, toSessionSummary } from '@/modules/extra-lessons/dto/responses/extra.view';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { type SessionDetailRow, type SessionSummaryRow } from '@/modules/extra-lessons/types/extra.types';
import { monthRange } from '@/modules/extra-lessons/utils/session-time';

/** Đọc buổi điểm danh: ADMIN mọi buổi; GV buổi mình phụ trách hoặc thuộc ca mình dạy */
@Injectable()
export class AttendanceReaderService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly access: ExtraAccessService,
  ) {}

  async list(
    user: AuthUser,
    query: AttendanceSessionListQuery,
  ): Promise<Paginated<AttendanceSessionSummary>> {
    const where: Prisma.AttendanceSessionWhereInput = {
      AND: [
        await this.scopeWhere(user),
        {
          slotId: query.slotId,
          status: query.status,
          teacherIds: query.teacherId ? { has: query.teacherId } : undefined,
          date: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
        },
      ],
    };
    const sort = [
      orderBy(query.sort, ATTENDANCE_SORT_FIELDS, { date: 'desc' }),
      { startsAt: 'asc' as const },
      { id: 'asc' as const },
    ];
    return paginate(
      query,
      async (page) => this.toSummaries(await this.repo.list(where, page, sort)),
      () => this.repo.count(where),
    );
  }

  /** Badge menu: buổi chờ xác nhận đã bắt đầu trong phạm vi */
  async pendingCount(user: AuthUser): Promise<PendingCountResponse> {
    const where: Prisma.AttendanceSessionWhereInput = {
      AND: [await this.scopeWhere(user), { status: 'PENDING', startsAt: { lte: new Date() } }],
    };
    return { count: await this.repo.count(where) };
  }

  async detail(user: AuthUser, id: string): Promise<AttendanceSessionDetail> {
    const row = await this.find(id);
    await this.assertSessionAccess(user, row);
    return this.toDetail(user, row);
  }

  async find(id: string): Promise<SessionDetailRow> {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('sessionNotFound');
    return row;
  }

  /** GV: phụ trách buổi (lúc tạo) hoặc đang dạy ca của buổi */
  async canAccessSession(
    user: AuthUser,
    row: Pick<SessionDetailRow, 'teacherIds' | 'slotId'>,
  ): Promise<boolean> {
    if (user.role === 'ADMIN') return true;
    if (row.teacherIds.includes(user.id)) return true;
    return !!row.slotId && (await this.access.teachesSlot(user, row.slotId));
  }

  async assertSessionAccess(
    user: AuthUser,
    row: Pick<SessionDetailRow, 'teacherIds' | 'slotId'>,
  ): Promise<void> {
    if (!(await this.canAccessSession(user, row))) throw new AppError('FORBIDDEN_SCOPE', 403);
  }

  async toDetail(user: AuthUser, row: SessionDetailRow): Promise<AttendanceSessionDetail> {
    const [[summary], showPrice, canConfirm] = await Promise.all([
      this.toSummaries([row]),
      this.access.has(user, 'extra.viewPricing'),
      this.access.has(user, 'attendance.confirm'),
    ]);
    return {
      ...summary,
      records: row.records.map((r) => toAttendanceRecord(r, showPrice)),
      canEdit: canConfirm && row.status !== 'CANCELLED' && (await this.canAccessSession(user, row)),
      canEditBilling: user.role === 'ADMIN' && row.status !== 'CANCELLED',
    };
  }

  /** Điểm danh theo tháng của học sinh (tab Học thêm; sau này khu phụ huynh) */
  async studentMonth(
    user: AuthUser,
    studentId: string,
    query: StudentAttendanceQuery,
  ): Promise<StudentAttendanceResponse> {
    await this.access.assertStudentAccess(user, studentId);
    const { from, to } = monthRange(query.month);
    const [rows, showPrice] = await Promise.all([
      this.repo.studentRecords(studentId, from, to),
      this.access.has(user, 'extra.viewPricing'),
    ]);
    const billable = rows.filter((r) => r.charged && r.session.status !== 'CANCELLED');
    return {
      month: query.month,
      items: rows.map((r) => ({
        sessionId: r.sessionId,
        date: r.session.date,
        startTime: r.session.startTime,
        slotName: r.session.slot?.name ?? null,
        status: r.session.status,
        mark: r.mark,
        charged: r.charged,
        unitPrice: showPrice ? r.unitPrice : null,
        source: r.source === 'MANUAL' ? 'MANUAL' : 'SNAPSHOT',
      })),
      chargedTotal: showPrice ? billable.reduce((sum, r) => sum + r.unitPrice, 0) : null,
    };
  }

  private async scopeWhere(user: AuthUser): Promise<Prisma.AttendanceSessionWhereInput> {
    const slots = await this.access.slotScope(user);
    if (!slots) return {};
    return { OR: [{ teacherIds: { has: user.id } }, { slotId: { in: slots } }] };
  }

  private async toSummaries(rows: readonly SessionSummaryRow[]): Promise<AttendanceSessionSummary[]> {
    const [teachers, missing] = await Promise.all([
      this.repo.teachers(rows.flatMap((r) => r.teacherIds)),
      this.repo.missingRateCounts(rows.map((r) => r.id)),
    ]);
    const byId = new Map(teachers.map((t) => [t.id, t]));
    return rows.map((r) => toSessionSummary(r, byId, missing.get(r.id) ?? 0));
  }
}
