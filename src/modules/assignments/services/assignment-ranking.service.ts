import { Injectable } from '@nestjs/common';
import { AvatarKey, DEFAULT_AVATAR, type AssignmentRankingEntry } from '@phonics/contracts';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';

export interface AssignmentRankRow {
  submissionId: string;
  studentId: string;
  totalScore: number;
  maxScore: number;
  durationMs: number | null;
  submittedAt: Date;
  attemptNo: number;
  rank: number;
}

/**
 * Xếp hạng theo bài giao (ADR 0019): mỗi học sinh lấy bài GRADED tốt nhất (điểm cao → nhanh → nộp sớm),
 * RANK() bằng điểm thì cùng hạng. Tách hoàn toàn khỏi RankingService / point_entries của game.
 */
@Injectable()
export class AssignmentRankingService {
  constructor(private readonly prisma: PrismaService) {}

  async rank(assignmentId: string, tx: Tx = this.prisma): Promise<AssignmentRankRow[]> {
    return tx.$queryRaw<AssignmentRankRow[]>`
      WITH best AS (
        SELECT DISTINCT ON (s.student_id)
               s.id AS "submissionId", s.student_id AS "studentId", s.total_score AS "totalScore",
               s.max_score AS "maxScore", s.duration_ms AS "durationMs", s.submitted_at AS "submittedAt",
               s.attempt_no AS "attemptNo"
        FROM   submissions s
        WHERE  s.assignment_id = ${assignmentId}::uuid AND s.status = 'GRADED' AND s.total_score IS NOT NULL
        ORDER  BY s.student_id, s.total_score DESC, s.duration_ms ASC NULLS LAST, s.submitted_at ASC
      )
      SELECT b.*,
             RANK() OVER (ORDER BY b."totalScore" DESC, b."durationMs" ASC NULLS LAST, b."submittedAt" ASC)::int AS rank
      FROM   best b
      ORDER  BY rank, b."submittedAt"`;
  }

  /** Hạng + sĩ số (đã GRADED) của một học sinh trong bài giao; null nếu chưa có bài GRADED */
  async rankOf(
    assignmentId: string,
    studentId: string,
    tx: Tx = this.prisma,
  ): Promise<{ rank: number; members: number } | null> {
    const rows = await this.rank(assignmentId, tx);
    const me = rows.find((r) => r.studentId === studentId);
    return me ? { rank: me.rank, members: rows.length } : null;
  }

  /** Bảng xếp hạng kèm tên / avatar */
  async entries(assignmentId: string, meId?: string): Promise<AssignmentRankingEntry[]> {
    const rows = await this.rank(assignmentId);
    if (!rows.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.studentId) } },
      select: { id: true, displayName: true, avatarKey: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = byId.get(r.studentId);
      return {
        rank: r.rank,
        studentId: r.studentId,
        displayName: u?.displayName ?? '?',
        avatarKey: AvatarKey.safeParse(u?.avatarKey).data ?? DEFAULT_AVATAR,
        submissionId: r.submissionId,
        totalScore: r.totalScore,
        maxScore: r.maxScore,
        percent: r.maxScore > 0 ? Math.min(1, r.totalScore / r.maxScore) : 0,
        durationMs: r.durationMs,
        submittedAt: r.submittedAt.toISOString(),
        attemptNo: r.attemptNo,
        isMe: r.studentId === meId,
      };
    });
  }
}
