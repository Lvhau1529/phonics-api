import { Injectable } from '@nestjs/common';
import { type StudentWorksheetRecent, type StudentWorksheetStats } from '@phonics/contracts';
import { AppError } from '../../../common/errors/app-error';
import { AccessService } from '../../../core/access/access.service';
import { Prisma } from '../../../generated/prisma/client';
import { AssignmentRankingService } from '../../assignments/services/assignment-ranking.service';
import { isoDateOf } from '../../assignments/utils/assignment-dates';
import { type AuthUser } from '../../auth/types/auth.types';
import { WorksheetStatsRepository } from '../repositories/worksheet-stats.repository';
import { avg, bestGraded, groupByAssignment, isPastDue, percentOf } from '../utils/worksheet-stats.math';

const RECENT = 10;

/** Thống kê phiếu của một học sinh (GV / admin trong phạm vi; học sinh chỉ xem chính mình) */
@Injectable()
export class StudentWorksheetStatsService {
  constructor(
    private readonly repo: WorksheetStatsRepository,
    private readonly access: AccessService,
    private readonly ranking: AssignmentRankingService,
  ) {}

  async studentStats(user: AuthUser, studentId: string): Promise<StudentWorksheetStats> {
    if (user.role === 'STUDENT') {
      if (user.id !== studentId) throw new AppError('FORBIDDEN', 403);
    } else {
      await this.access.assertStudentAccess(user, studentId);
    }
    const classId = await this.repo.currentClassId(studentId);
    const now = new Date();
    const studentSql = Prisma.sql`s.student_id = ${studentId}::uuid`;
    const [classAssignments, submissions, byType, trend] = await Promise.all([
      classId ? this.repo.visibleAssignments(classId) : Promise.resolve([]),
      this.repo.studentSubmissions(studentId),
      this.repo.byType(studentSql),
      this.repo.trend(studentSql),
    ]);
    const byAssignment = groupByAssignment(submissions);
    const finished = [...byAssignment.values()].filter((list) =>
      list.some((s) => s.status !== 'IN_PROGRESS'),
    );
    const bestPercents = finished
      .map((list) => bestGraded(list))
      .filter((b): b is NonNullable<typeof b> => !!b && b.maxScore > 0)
      .map((b) => Math.min(1, (b.totalScore ?? 0) / b.maxScore));
    const missing = classAssignments.filter(
      (a) => !byAssignment.get(a.id)?.some((s) => s.status !== 'IN_PROGRESS') && isPastDue(a, now),
    ).length;

    const latestAssignments = classAssignments.slice(0, RECENT);
    const ranks = await Promise.all(latestAssignments.map((a) => this.ranking.rankOf(a.id, studentId)));
    const recent: StudentWorksheetRecent[] = latestAssignments.map((a, i) => {
      const list = byAssignment.get(a.id) ?? [];
      const latest = list.at(-1);
      const chosen = bestGraded(list) ?? latest;
      return {
        assignmentId: a.id,
        worksheetTitle: a.worksheet.title,
        scheduledFor: isoDateOf(a.scheduledFor),
        submissionId: chosen?.id ?? null,
        status: chosen?.status ?? null,
        totalScore: chosen?.totalScore ?? null,
        maxScore: a.maxScore,
        percent: chosen ? percentOf(chosen.totalScore, a.maxScore) : null,
        late: latest?.late ?? false,
        rank: ranks[i]?.rank ?? null,
      };
    });

    return {
      studentId,
      done: finished.length,
      late: finished.filter((list) => list.some((s) => s.status !== 'IN_PROGRESS' && s.late)).length,
      missing,
      inProgress: submissions.filter((s) => s.status === 'IN_PROGRESS').length,
      pendingGrading: submissions.filter((s) => s.status === 'SUBMITTED').length,
      avgPercent: avg(bestPercents),
      bestPercent: bestPercents.length ? Math.max(...bestPercents) : null,
      byType,
      trend,
      recent,
      generatedAt: new Date().toISOString(),
    };
  }
}
