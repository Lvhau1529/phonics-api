import { Injectable } from '@nestjs/common';
import { type ClassWorksheetOverview, type WorksheetStatsQuery } from '@phonics/contracts';
import { AccessService } from '../../../core/access/access.service';
import { TimeService } from '../../../core/time/time.service';
import { Prisma } from '../../../generated/prisma/client';
import { dateOnly } from '../../assignments/utils/assignment-dates';
import { type AuthUser } from '../../auth/types/auth.types';
import { WorksheetStatsRepository, scheduledRangeSql } from '../repositories/worksheet-stats.repository';
import { avg, isPastDue } from '../utils/worksheet-stats.math';

/** Tổng quan phiếu của một lớp trong khoảng thời gian (theo ngày trên lịch) */
@Injectable()
export class ClassWorksheetStatsService {
  constructor(
    private readonly repo: WorksheetStatsRepository,
    private readonly access: AccessService,
    private readonly time: TimeService,
  ) {}

  async classOverview(
    user: AuthUser,
    classId: string,
    query: WorksheetStatsQuery,
  ): Promise<ClassWorksheetOverview> {
    await this.access.assertClassAccess(user, classId);
    const range = this.time.resolveRange(query);
    const where: Prisma.AssignmentWhereInput = {
      classId,
      scheduledFor: range
        ? { gte: dateOnly(this.time.toIsoDate(range.from)), lt: dateOnly(this.time.toIsoDate(range.to)) }
        : undefined,
    };
    const sqlWhere = Prisma.sql`a.class_id = ${classId}::uuid AND ${scheduledRangeSql(range)}`;
    const now = new Date();
    const [assignments, students, submissions, byType, trend] = await Promise.all([
      this.repo.classAssignments(where),
      this.repo.activeMemberCount(classId),
      this.repo.finishedSubmissions(where),
      this.repo.byType(sqlWhere),
      this.repo.trend(sqlWhere),
    ]);
    const closedOrDue = assignments.filter((a) => isPastDue(a, now)).length;
    const submittedPairs = new Set(submissions.map((s) => `${s.assignmentId}:${s.studentId}`)).size;
    const graded = submissions.filter(
      (s) => s.status === 'GRADED' && s.totalScore !== null && s.maxScore > 0,
    );
    return {
      classId,
      assignments: assignments.length,
      open: assignments.filter((a) => a.status === 'OPEN').length,
      avgPercent: avg(graded.map((s) => Math.min(1, (s.totalScore ?? 0) / s.maxScore))),
      completionRate:
        closedOrDue * students > 0 ? Math.min(1, submittedPairs / (closedOrDue * students)) : null,
      lateRate: submissions.length ? submissions.filter((s) => s.late).length / submissions.length : null,
      pendingGrading: submissions.filter((s) => s.status === 'SUBMITTED').length,
      byType,
      trend,
      generatedAt: new Date().toISOString(),
    };
  }
}
