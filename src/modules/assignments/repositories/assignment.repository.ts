import { Injectable } from '@nestjs/common';
import { type AssignmentCounts, MANUAL_TYPES } from '@phonics/contracts';
import { clamp } from 'es-toolkit';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { Prisma } from '@/generated/prisma/client';
import {
  type MySubmissionBrief,
  type RosterMember,
  type RosterSubmission,
} from '@/modules/assignments/dto/responses/assignment.view';
import {
  type AssignmentCountsRow,
  type AssignmentRow,
  assignmentInclude,
} from '@/modules/assignments/types/assignment.types';
import { dateOnly } from '@/modules/assignments/utils/assignment-dates';

/** Mọi truy vấn Prisma của bài giao. Service chỉ gọi repository, không đụng `PrismaService` trực tiếp. */
@Injectable()
export class AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // ---------- đọc một / nhiều ----------

  findById(id: string, db: Tx | PrismaService = this.prisma): Promise<AssignmentRow | null> {
    return db.assignment.findUnique({ where: { id }, include: assignmentInclude });
  }

  findByIdOrThrow(id: string, db: Tx | PrismaService = this.prisma): Promise<AssignmentRow> {
    return db.assignment.findUniqueOrThrow({ where: { id }, include: assignmentInclude });
  }

  findInClass(id: string, classId: string): Promise<AssignmentRow | null> {
    return this.prisma.assignment.findFirst({ where: { id, classId }, include: assignmentInclude });
  }

  findPage(
    where: Prisma.AssignmentWhereInput,
    page: { skip: number; take: number },
    orderBy: Prisma.AssignmentOrderByWithRelationInput[],
  ): Promise<AssignmentRow[]> {
    return this.prisma.assignment.findMany({ where, ...page, orderBy, include: assignmentInclude });
  }

  count(where: Prisma.AssignmentWhereInput): Promise<number> {
    return this.prisma.assignment.count({ where });
  }

  /** Bài chưa đóng có hạn nộp trong `[from, to)` hoặc nằm đúng ngày `isoDay` trên lịch */
  findDueOrScheduledOn(
    scope: Prisma.AssignmentWhereInput,
    range: { from: Date; to: Date },
    isoDay: string,
  ): Promise<AssignmentRow[]> {
    return this.prisma.assignment.findMany({
      where: {
        AND: [
          scope,
          { status: { not: 'CLOSED' } },
          { OR: [{ dueAt: { gte: range.from, lt: range.to } }, { scheduledFor: dateOnly(isoDay) }] },
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 20,
      include: assignmentInclude,
    });
  }

  countPendingGrading(scope: Prisma.AssignmentWhereInput): Promise<number> {
    return this.prisma.submission.count({ where: { status: 'SUBMITTED', assignment: scope } });
  }

  countSubmissions(assignmentId: string): Promise<number> {
    return this.prisma.submission.count({ where: { assignmentId } });
  }

  // ---------- ghi ----------

  create(
    data: Prisma.AssignmentUncheckedCreateInput,
    db: Tx | PrismaService = this.prisma,
  ): Promise<AssignmentRow> {
    return db.assignment.create({ data, include: assignmentInclude });
  }

  update(
    id: string,
    data: Prisma.AssignmentUncheckedUpdateInput,
    db: Tx | PrismaService = this.prisma,
  ): Promise<AssignmentRow> {
    return db.assignment.update({ where: { id }, data, include: assignmentInclude });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.assignment.delete({ where: { id } });
  }

  // ---------- hẹn giờ mở / đóng (AssignmentsScheduler) ----------

  /** Mốc sớm nhất có bài cần mở (SCHEDULED) hoặc cần đóng (OPEN quá hạn, không cho nộp muộn); null = không có */
  async nextTransitionAt(): Promise<Date | null> {
    const [toOpen, toClose] = await Promise.all([
      this.prisma.assignment.findFirst({
        where: { status: 'SCHEDULED' },
        orderBy: { availableFrom: 'asc' },
        select: { availableFrom: true },
      }),
      this.prisma.assignment.findFirst({
        where: { status: 'OPEN', allowLate: false, dueAt: { not: null } },
        orderBy: { dueAt: 'asc' },
        select: { dueAt: true },
      }),
    ]);
    const times = [toOpen?.availableFrom, toClose?.dueAt].filter((d): d is Date => d != null);
    return times.length ? new Date(Math.min(...times.map(Number))) : null;
  }

  findScheduledDue(now: Date, take = 200): Promise<{ id: string }[]> {
    return this.prisma.assignment.findMany({
      where: { status: 'SCHEDULED', availableFrom: { lte: now } },
      select: { id: true },
      take,
    });
  }

  /** Mở bài nếu vẫn còn SCHEDULED; trả số dòng đổi (1 = chính tiến trình này mở → được phép thông báo) */
  async openIfScheduled(tx: Tx, id: string, now: Date): Promise<number> {
    const { count } = await tx.assignment.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'OPEN', openedAt: now },
    });
    return count;
  }

  async closeOverdue(now: Date): Promise<number> {
    const { count } = await this.prisma.assignment.updateMany({
      where: { status: 'OPEN', allowLate: false, dueAt: { lte: now } },
      data: { status: 'CLOSED', closedAt: now },
    });
    return count;
  }

  // ---------- lớp / học sinh ----------

  async activeStudentIds(classId: string, db: Tx | PrismaService = this.prisma): Promise<string[]> {
    const rows = await db.classMembership.findMany({
      where: { classId, leftAt: null },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  rosterMembers(classId: string): Promise<RosterMember[]> {
    return this.prisma.classMembership.findMany({
      where: { classId, leftAt: null },
      select: {
        studentId: true,
        student: { select: { user: { select: { displayName: true, avatarKey: true } } } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  rosterSubmissions(assignmentId: string): Promise<RosterSubmission[]> {
    return this.prisma.submission.findMany({
      where: { assignmentId },
      orderBy: { attemptNo: 'asc' },
      select: {
        id: true,
        studentId: true,
        status: true,
        attemptNo: true,
        totalScore: true,
        maxScore: true,
        late: true,
        submittedAt: true,
        answers: {
          where: { questionType: { in: [...MANUAL_TYPES] }, manualScore: null },
          select: { id: true },
        },
      },
    });
  }

  /** Lớp học sinh đang học (null nếu chưa có lớp) */
  async currentClassId(studentId: string): Promise<string | null> {
    const membership = await this.prisma.classMembership.findFirst({
      where: { studentId, leftAt: null },
      select: { classId: true },
    });
    return membership?.classId ?? null;
  }

  /** Các lần làm của một học sinh trên nhiều bài (kèm nhận xét gốc của GV mà bé chưa trả lời) */
  studentSubmissionBriefs(assignmentIds: readonly string[], studentId: string): Promise<MySubmissionBrief[]> {
    return this.prisma.submission.findMany({
      where: { assignmentId: { in: [...assignmentIds] }, studentId },
      orderBy: { attemptNo: 'asc' },
      select: {
        id: true,
        assignmentId: true,
        status: true,
        totalScore: true,
        maxScore: true,
        late: true,
        comments: {
          where: {
            deletedAt: null,
            parentId: null,
            authorId: { not: studentId },
            replies: { none: { authorId: studentId } },
          },
          select: { id: true },
        },
      },
    });
  }

  /** Các lần làm đầy đủ của học sinh trên một bài (để dựng SubmissionSummary) */
  studentSubmissions(assignmentId: string, studentId: string) {
    return this.prisma.submission.findMany({
      where: { assignmentId, studentId },
      orderBy: { attemptNo: 'asc' },
      include: {
        student: { select: { user: { select: { displayName: true } } } },
        gradedBy: { select: { displayName: true } },
      },
    });
  }

  // ---------- thống kê nhanh ----------

  /** Sĩ số / đã nộp / đã chấm / chờ chấm / điểm trung bình cho một tập bài giao */
  async countsFor(ids: readonly string[]): Promise<Map<string, AssignmentCounts>> {
    const map = new Map<string, AssignmentCounts>();
    if (!ids.length) return map;
    const rows = await this.prisma.$queryRaw<AssignmentCountsRow[]>`
      SELECT a.id AS "assignmentId",
             (SELECT COUNT(*) FROM class_memberships m WHERE m.class_id = a.class_id AND m.left_at IS NULL)::int AS students,
             COUNT(DISTINCT s.student_id) FILTER (WHERE s.status IN ('SUBMITTED', 'GRADED'))::int AS submitted,
             COUNT(DISTINCT s.student_id) FILTER (WHERE s.status = 'GRADED')::int AS graded,
             COUNT(*) FILTER (WHERE s.status = 'SUBMITTED')::int AS "pendingGrading",
             AVG(s.total_score / NULLIF(s.max_score, 0)) FILTER (WHERE s.status = 'GRADED')::float AS "avgPercent"
      FROM   assignments a
      LEFT JOIN submissions s ON s.assignment_id = a.id
      WHERE  a.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP  BY a.id, a.class_id`;
    for (const r of rows) {
      map.set(r.assignmentId, {
        students: r.students,
        submitted: r.submitted,
        graded: r.graded,
        missing: Math.max(0, r.students - r.submitted),
        pendingGrading: r.pendingGrading,
        avgPercent: r.avgPercent === null ? null : clamp(r.avgPercent, 0, 1),
      });
    }
    return map;
  }
}
