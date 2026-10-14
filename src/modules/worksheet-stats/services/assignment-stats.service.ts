import { Injectable } from '@nestjs/common';
import { type AssignmentItemStats, type AssignmentStats, type WorksheetSnapshot } from '@phonics/contracts';
import { AssignmentRankingService } from '@/modules/assignments/services/assignment-ranking.service';
import { AssignmentReaderService } from '@/modules/assignments/services/assignment-reader.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { WorksheetStatsRepository } from '@/modules/worksheet-stats/repositories/worksheet-stats.repository';
import { distributePercents } from '@/modules/worksheet-stats/utils/worksheet-stats.math';

/** Thống kê một bài giao: phân bố điểm, nộp muộn, độ đúng từng câu */
@Injectable()
export class AssignmentStatsService {
  constructor(
    private readonly repo: WorksheetStatsRepository,
    private readonly assignments: AssignmentReaderService,
    private readonly ranking: AssignmentRankingService,
  ) {}

  async assignmentStats(user: AuthUser, assignmentId: string): Promise<AssignmentStats> {
    const row = await this.assignments.load(user, assignmentId);
    const snapshot = row.snapshot as unknown as WorksheetSnapshot;
    const [counts, ranks, late, itemRows] = await Promise.all([
      this.assignments.countsFor([assignmentId]),
      this.ranking.rank(assignmentId),
      this.repo.lateStudentCount(assignmentId),
      this.repo.itemStats(assignmentId),
    ]);
    const c = counts.get(assignmentId);
    const byItem = new Map(itemRows.map((r) => [r.worksheetItemId, r]));
    const items: AssignmentItemStats[] = snapshot.sections.flatMap((s) =>
      s.items.map((it) => {
        const r = byItem.get(it.worksheetItemId);
        return {
          worksheetItemId: it.worksheetItemId,
          sectionTitle: s.title,
          order: it.order,
          type: it.question.type,
          instruction: it.question.instruction,
          points: it.points,
          answered: r?.answered ?? 0,
          correct: r?.correct ?? 0,
          avgScore: r?.avgScore ?? 0,
          accuracy: r && r.answered > 0 ? r.correct / r.answered : 0,
        };
      }),
    );
    return {
      assignmentId,
      students: c?.students ?? 0,
      submitted: c?.submitted ?? 0,
      graded: c?.graded ?? 0,
      missing: c?.missing ?? 0,
      late,
      avgPercent: c?.avgPercent ?? null,
      distribution: distributePercents(ranks.map((r) => (r.maxScore > 0 ? r.totalScore / r.maxScore : 0))),
      items,
      generatedAt: new Date().toISOString(),
    };
  }
}
