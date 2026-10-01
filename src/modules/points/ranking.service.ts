import { Injectable } from '@nestjs/common';
import { type RankingEntry } from '@phonics/contracts';
import { RANK_NOTIFY_POLICY } from '../../config/constants';
import { PrismaService } from '../../core/database/prisma.service';
import { type Tx } from '../../core/database/types';
import { type DateRange } from '../../core/time/time.service';
import { Prisma } from '../../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

export interface RankRow {
  studentId: string;
  points: number;
  rank: number;
}

export interface RankFilter {
  range?: DateRange | null;
  gameId?: string | null;
}

export interface RankChange {
  previous: number | null;
  current: number | null;
}

/**
 * So sánh hạng cũ / mới, trả danh sách thay đổi. Hàm thuần để test không cần DB.
 * prev = null (lần đầu vào lớp) thì không coi là thay đổi (không thông báo).
 */
export function diffRanks(
  prev: ReadonlyMap<string, number | null>,
  next: ReadonlyMap<string, number>,
): { studentId: string; from: number; to: number }[] {
  const changes: { studentId: string; from: number; to: number }[] = [];
  for (const [studentId, to] of next) {
    const from = prev.get(studentId);
    if (from == null || from === to) continue;
    if (RANK_NOTIFY_POLICY === 'improve' && to > from) continue;
    changes.push({ studentId, from, to });
  }
  return changes;
}

/**
 * Chủ sở hữu duy nhất của SQL xếp hạng. Điểm ĐI THEO HỌC SINH: xếp hạng lớp = tổng điểm (mọi lớp)
 * của các thành viên đang hoạt động. RANK() → bằng điểm thì cùng hạng (1, 1, 3).
 */
@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async rankClass(tx: Tx, classId: string, filter: RankFilter = {}): Promise<RankRow[]> {
    const from = filter.range?.from ?? new Date(0);
    const to = filter.range?.to ?? new Date('2100-01-01T00:00:00Z');
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

  /** Bảng xếp hạng kèm tên / avatar (cho /me/class/ranking, /classes/:id/ranking) */
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
        avatarKey: (u?.avatarKey as RankingEntry['avatarKey']) ?? 'pip',
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

  /**
   * Tính lại hạng tổng (mọi thời gian) của cả lớp sau khi có bút toán điểm / đổi thành viên,
   * cập nhật `last_rank` và tạo thông báo RANK_CHANGED cho ai đổi hạng. Gọi trong cùng transaction
   * với insert điểm; khoá advisory theo lớp để hai ván kết thúc cùng lúc không tính chồng.
   * Trả về hạng trước / sau của `actorStudentId` (nếu có).
   */
  async recomputeAndNotify(tx: Tx, classId: string, actorStudentId?: string): Promise<RankChange> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${classId}))`;
    const [rows, memberships, cls] = await Promise.all([
      this.rankClass(tx, classId),
      tx.classMembership.findMany({
        where: { classId, leftAt: null },
        select: { id: true, studentId: true, lastRank: true },
      }),
      tx.class.findUnique({ where: { id: classId }, select: { name: true } }),
    ]);

    const prev = new Map(memberships.map((m) => [m.studentId, m.lastRank]));
    const next = new Map(rows.map((r) => [r.studentId, r.rank]));
    const now = new Date();

    for (const m of memberships) {
      const rank = next.get(m.studentId);
      if (rank !== undefined && rank !== m.lastRank) {
        await tx.classMembership.update({ where: { id: m.id }, data: { lastRank: rank, lastRankAt: now } });
      }
    }

    for (const change of diffRanks(prev, next)) {
      await this.notifications.upsertRankChanged(tx, change.studentId, {
        classId,
        className: cls?.name ?? '',
        from: change.from,
        to: change.to,
        members: rows.length,
      });
    }

    return {
      previous: actorStudentId ? (prev.get(actorStudentId) ?? null) : null,
      current: actorStudentId ? (next.get(actorStudentId) ?? null) : null,
    };
  }
}
