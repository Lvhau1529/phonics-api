import { Injectable } from '@nestjs/common';
import { AvatarKey, DEFAULT_AVATAR, type RankingEntry } from '@phonics/contracts';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type DateRange } from '@/core/time/time.service';
import { Prisma } from '@/generated/prisma/client';
import { EPOCH, FAR_FUTURE } from '@/core/time/dayjs';

export interface RankRow {
  studentId: string;
  points: number;
  rank: number;
}

export interface RankFilter {
  range?: DateRange | null;
  gameId?: string | null;
}

/**
 * Chủ sở hữu duy nhất của SQL xếp hạng. Điểm ĐI THEO HỌC SINH: xếp hạng lớp = tổng điểm (mọi lớp)
 * của các thành viên đang hoạt động. RANK() → bằng điểm thì cùng hạng (1, 1, 3).
 */
@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async rankClass(tx: Tx, classId: string, filter: RankFilter = {}): Promise<RankRow[]> {
    const from = filter.range?.from ?? EPOCH;
    const to = filter.range?.to ?? FAR_FUTURE;
    const gameFilter = filter.gameId ? Prisma.sql`AND p.game_id = ${filter.gameId}` : Prisma.empty;
    return tx.$queryRaw<RankRow[]>`
      SELECT m.student_id                                   AS "studentId",
             COALESCE(SUM(p.points), 0)::int                AS points,
             RANK() OVER (ORDER BY COALESCE(SUM(p.points), 0) DESC)::int AS rank
      FROM   class_memberships m
      LEFT JOIN point_entries p
             ON p.student_id = m.student_id
            AND p.created_at >= ${from} AND p.created_at < ${to}
            ${gameFilter}
      WHERE  m.class_id = ${classId}::uuid AND m.left_at IS NULL
      GROUP  BY m.student_id, m.joined_at
      ORDER  BY points DESC, m.joined_at ASC`;
  }

  /** Bảng xếp hạng kèm tên / avatar (cho /classes/:id/ranking) */
  async rankingEntries(classId: string, filter: RankFilter, meId?: string): Promise<RankingEntry[]> {
    const rows = await this.rankClass(this.prisma, classId, filter);
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
        points: r.points,
        isMe: r.studentId === meId,
      };
    });
  }

  /** Hạng hiện tại (tổng điểm mọi thời gian) của một học sinh trong lớp đang học, null nếu chưa có lớp */
  async currentRank(studentId: string): Promise<{ classId: string; rank: number; members: number } | null> {
    const membership = await this.prisma.classMembership.findFirst({
      where: { studentId, leftAt: null },
      select: { classId: true },
    });
    if (!membership) return null;
    const rows = await this.rankClass(this.prisma, membership.classId);
    const me = rows.find((r) => r.studentId === studentId);
    return me ? { classId: membership.classId, rank: me.rank, members: rows.length } : null;
  }
}
