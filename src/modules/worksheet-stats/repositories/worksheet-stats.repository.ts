import { Injectable } from '@nestjs/common';
import { type TypeAccuracy, type WeekBucket } from '@phonics/contracts';
import { type DateRange } from '@/core/time/time.service';
import { PrismaService } from '@/database/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import {
  type AssignmentBrief,
  type ItemRow,
  type SubmissionBrief,
  type TypeRow,
  type WeekRow,
} from '@/modules/worksheet-stats/types/worksheet-stats.types';
import { toTypeAccuracy, toWeekBucket } from '@/modules/worksheet-stats/utils/worksheet-stats.math';

/** "Bài tốt nhất đã GRADED của mỗi (bài giao, học sinh)" — CTE dùng chung cho byType / trend */
const BEST_CTE = (where: Prisma.Sql) => Prisma.sql`
  best AS (
    SELECT DISTINCT ON (s.assignment_id, s.student_id) s.id, s.assignment_id, s.student_id, s.total_score, s.max_score
    FROM   submissions s
    JOIN   assignments a ON a.id = s.assignment_id
    WHERE  s.status = 'GRADED' AND s.total_score IS NOT NULL AND ${where}
    ORDER  BY s.assignment_id, s.student_id, s.total_score DESC, s.duration_ms ASC NULLS LAST
  )`;

/** Điều kiện SQL theo scheduled_for cho DateRange (null = không giới hạn) */
export function scheduledRangeSql(range: DateRange | null): Prisma.Sql {
  if (!range) return Prisma.sql`TRUE`;
  return Prisma.sql`a.scheduled_for >= ${range.from}::date AND a.scheduled_for < ${range.to}::date`;
}

const SUBMISSION_BRIEF = {
  id: true,
  assignmentId: true,
  studentId: true,
  status: true,
  late: true,
  totalScore: true,
  maxScore: true,
} satisfies Prisma.SubmissionSelect;

/** Truy vấn thống kê phiếu bài tập (Prisma + SQL raw). Tuần = Thứ Hai của `scheduled_for`. */
@Injectable()
export class WorksheetStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- bài giao ----------

  async lateStudentCount(assignmentId: string): Promise<number> {
    const rows = await this.prisma.submission.findMany({
      where: { assignmentId, late: true, status: { not: 'IN_PROGRESS' } },
      distinct: ['studentId'],
      select: { studentId: true },
    });
    return rows.length;
  }

  /** Thống kê từng câu trên lần nộp mới nhất của mỗi học sinh */
  itemStats(assignmentId: string): Promise<ItemRow[]> {
    return this.prisma.$queryRaw<ItemRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (s.student_id) s.id
        FROM   submissions s
        WHERE  s.assignment_id = ${assignmentId}::uuid AND s.status <> 'IN_PROGRESS'
        ORDER  BY s.student_id, s.attempt_no DESC)
      SELECT a.worksheet_item_id AS "worksheetItemId",
             COUNT(*)::int AS answered,
             COUNT(*) FILTER (WHERE a.is_correct)::int AS correct,
             AVG(COALESCE(a.manual_score, a.auto_score, 0))::float AS "avgScore"
      FROM   submission_answers a
      JOIN   latest l ON l.id = a.submission_id
      GROUP  BY a.worksheet_item_id`;
  }

  // ---------- lớp ----------

  classAssignments(where: Prisma.AssignmentWhereInput): Promise<AssignmentBrief[]> {
    return this.prisma.assignment.findMany({
      where,
      select: { id: true, status: true, dueAt: true, allowLate: true },
    });
  }

  activeMemberCount(classId: string): Promise<number> {
    return this.prisma.classMembership.count({ where: { classId, leftAt: null } });
  }

  finishedSubmissions(assignmentWhere: Prisma.AssignmentWhereInput): Promise<SubmissionBrief[]> {
    return this.prisma.submission.findMany({
      where: { assignment: assignmentWhere, status: { not: 'IN_PROGRESS' } },
      select: SUBMISSION_BRIEF,
    });
  }

  // ---------- học sinh ----------

  async currentClassId(studentId: string): Promise<string | null> {
    const m = await this.prisma.classMembership.findFirst({
      where: { studentId, leftAt: null },
      select: { classId: true },
    });
    return m?.classId ?? null;
  }

  /** Bài giao đã mở / đóng của lớp (mới nhất trước) */
  visibleAssignments(classId: string) {
    return this.prisma.assignment.findMany({
      where: { classId, status: { not: 'SCHEDULED' } },
      orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        dueAt: true,
        allowLate: true,
        scheduledFor: true,
        maxScore: true,
        worksheet: { select: { title: true } },
      },
    });
  }

  studentSubmissions(studentId: string): Promise<SubmissionBrief[]> {
    return this.prisma.submission.findMany({
      where: { studentId },
      orderBy: { attemptNo: 'asc' },
      select: SUBMISSION_BRIEF,
    });
  }

  // ---------- tổng hợp ----------

  /** Độ chính xác theo dạng câu trên bài GRADED tốt nhất (`where` dùng alias s / a) */
  async byType(where: Prisma.Sql): Promise<TypeAccuracy[]> {
    const rows = await this.prisma.$queryRaw<TypeRow[]>`
      WITH ${BEST_CTE(where)}
      SELECT sa.question_type AS type,
             COUNT(*)::int AS answered,
             COUNT(*) FILTER (WHERE sa.is_correct)::int AS correct,
             AVG(COALESCE(sa.manual_score, sa.auto_score, 0) / NULLIF(sa.max_points, 0))::float AS "avgScoreRatio"
      FROM   submission_answers sa
      JOIN   best b ON b.id = sa.submission_id
      GROUP  BY sa.question_type
      ORDER  BY sa.question_type`;
    return rows.map(toTypeAccuracy);
  }

  /** Điểm trung bình theo tuần (Thứ Hai của scheduled_for) */
  async trend(where: Prisma.Sql): Promise<WeekBucket[]> {
    const rows = await this.prisma.$queryRaw<WeekRow[]>`
      WITH ${BEST_CTE(where)}
      SELECT to_char(date_trunc('week', a.scheduled_for::timestamp), 'YYYY-MM-DD') AS "weekStart",
             COUNT(DISTINCT a.id)::int AS assignments,
             COUNT(b.id)::int AS submissions,
             AVG(b.total_score / NULLIF(b.max_score, 0))::float AS "avgPercent"
      FROM   best b
      JOIN   assignments a ON a.id = b.assignment_id
      GROUP  BY 1
      ORDER  BY 1`;
    return rows.map(toWeekBucket);
  }
}
