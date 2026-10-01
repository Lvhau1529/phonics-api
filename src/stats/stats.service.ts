import { Injectable } from '@nestjs/common';
import {
  GAME_IDS,
  type ClassGameStats,
  type DistributionBucket,
  type GameByClassStats,
  type GameTimelineBucket,
  type OverviewStats,
  type PointsTimelineBucket,
  type RangeQuery,
  type RankingQuery,
  type TimelineQuery,
  type TopStudent,
} from '@phonics/contracts';
import { type AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access/access.service';
import { notFound } from '../common/errors/app-error';
import { type DateRange, TimeService } from '../common/time/time.service';
import { Prisma } from '../generated/prisma/client';
import { RankingService } from '../points/ranking.service';
import { PrismaService } from '../prisma/prisma.service';
import { type GameTimelineQuery, type TopStudentsQuery } from './dto';

const DAY_MS = 24 * 3600 * 1000;
const EPOCH = new Date(0);
const FAR_FUTURE = new Date('2100-01-01T00:00:00Z');

/** [from, to) dùng được trong SQL (null = không giới hạn) */
function bounds(range: DateRange | null): DateRange {
  return range ?? { from: EPOCH, to: FAR_FUTURE };
}

/** `IN (uuid, uuid, …)` — caller đảm bảo danh sách không rỗng */
function uuidList(ids: readonly string[]): Prisma.Sql {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}

/**
 * Subquery học sinh đang là thành viên của một / nhiều lớp. Điểm và kết quả ĐI THEO HỌC SINH,
 * nên mọi thống kê theo lớp lọc theo `student_id IN (thành viên hiện tại)` thay vì `class_id`.
 */
function membersOf(classIds: readonly string[]): Prisma.Sql {
  return Prisma.sql`(SELECT m.student_id FROM class_memberships m
                      WHERE m.left_at IS NULL AND m.class_id IN (${uuidList(classIds)}))`;
}

/** Bước phân bố điểm theo điểm cao nhất của lớp */
export function distributionWidth(maxPoints: number): number {
  if (maxPoints <= 50) return 10;
  if (maxPoints <= 200) return 25;
  return 50;
}

/**
 * Gom điểm của học sinh vào các bucket [from, to) rộng `width`, bắt đầu từ 0.
 * Điểm âm / 0 rơi vào bucket đầu. Hàm thuần để test không cần DB.
 */
export function distribute(points: readonly number[]): DistributionBucket[] {
  const max = points.reduce((m, p) => Math.max(m, p), 0);
  const width = distributionWidth(max);
  const buckets: DistributionBucket[] = [];
  for (let from = 0; from <= max; from += width) buckets.push({ from, to: from + width, count: 0 });
  for (const p of points) {
    const idx = Math.min(buckets.length - 1, Math.max(0, Math.floor(p / width)));
    buckets[idx].count += 1;
  }
  return buckets;
}

interface TimelineRow {
  bucketStart: string;
  GAME: number;
  BONUS: number;
}

interface GameResultAgg {
  gameId: string;
  rounds: number;
  players: number;
  correct: number;
  total: number;
}

/**
 * Thống kê cho admin / giáo viên. Mốc thời gian (ngày, tuần) tính theo APP_TIMEZONE:
 * SQL dùng `date_trunc(bucket, ts AT TIME ZONE tz)`; tuần của Postgres bắt đầu Thứ Hai (khớp TimeService).
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
    private readonly access: AccessService,
    private readonly ranking: RankingService,
  ) {}

  /** GET /stats/overview — ADMIN: toàn hệ thống; TEACHER: gói trong các lớp mình dạy */
  async overview(user: AuthUser, now = new Date()): Promise<OverviewStats> {
    const range: DateRange = { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
    const classIds = await this.access.scopedClassIds(user);
    const generatedAt = now.toISOString();

    if (classIds && !classIds.length) {
      return {
        students: 0,
        teachers: 0,
        classes: 0,
        pointsLast7d: 0,
        roundsLast7d: 0,
        viewsLast7d: 0,
        playsLast7d: 0,
        activeStudentsLast7d: 0,
        generatedAt,
      };
    }

    const [counts, activity] = await Promise.all([
      classIds ? this.scopedCounts(classIds) : this.globalCounts(),
      this.activity(range, classIds),
    ]);
    return { ...counts, ...activity, generatedAt };
  }

  private async globalCounts(): Promise<Pick<OverviewStats, 'students' | 'teachers' | 'classes'>> {
    const [students, teachers, classes] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
      this.prisma.class.count({ where: { archivedAt: null } }),
    ]);
    return { students, teachers, classes };
  }

  private async scopedCounts(
    classIds: string[],
  ): Promise<Pick<OverviewStats, 'students' | 'teachers' | 'classes'>> {
    const ids = uuidList(classIds);
    const [row] = await this.prisma.$queryRaw<[{ students: number; teachers: number; classes: number }]>`
      SELECT (SELECT COUNT(DISTINCT m.student_id) FROM class_memberships m
               WHERE m.left_at IS NULL AND m.class_id IN (${ids}))::int                 AS students,
             (SELECT COUNT(DISTINCT t.teacher_id) FROM class_teachers t
               WHERE t.class_id IN (${ids}))::int                                        AS teachers,
             (SELECT COUNT(*) FROM classes c WHERE c.archived_at IS NULL AND c.id IN (${ids}))::int AS classes`;
    return row;
  }

  /** Hoạt động 7 ngày: điểm, ván, lượt xem / chơi, học sinh có chơi (lọc theo thành viên lớp nếu có scope) */
  private async activity(
    range: DateRange,
    classIds: string[] | undefined,
  ): Promise<
    Pick<
      OverviewStats,
      'pointsLast7d' | 'roundsLast7d' | 'viewsLast7d' | 'playsLast7d' | 'activeStudentsLast7d'
    >
  > {
    const members = classIds ? membersOf(classIds) : null;
    const pointScope = members ? Prisma.sql`AND p.student_id IN ${members}` : Prisma.empty;
    const resultScope = members ? Prisma.sql`AND r.student_id IN ${members}` : Prisma.empty;
    const eventScope = members ? Prisma.sql`AND e.user_id IN ${members}` : Prisma.empty;
    const [row] = await this.prisma.$queryRaw<
      [{ points: number; rounds: number; views: number; plays: number; activeStudents: number }]
    >`
      SELECT (SELECT COALESCE(SUM(p.points), 0) FROM point_entries p
               WHERE p.created_at >= ${range.from} AND p.created_at < ${range.to} ${pointScope})::int AS points,
             (SELECT COUNT(*) FROM game_results r
               WHERE r.played_at >= ${range.from} AND r.played_at < ${range.to} ${resultScope})::int AS rounds,
             (SELECT COUNT(DISTINCT r.student_id) FROM game_results r
               WHERE r.played_at >= ${range.from} AND r.played_at < ${range.to} ${resultScope})::int AS "activeStudents",
             (SELECT COUNT(*) FROM game_events e
               WHERE e.type = 'VIEW' AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to} ${eventScope})::int AS views,
             (SELECT COUNT(*) FROM game_events e
               WHERE e.type = 'PLAY' AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to} ${eventScope})::int AS plays`;
    return {
      pointsLast7d: row.points,
      roundsLast7d: row.rounds,
      viewsLast7d: row.views,
      playsLast7d: row.plays,
      activeStudentsLast7d: row.activeStudents,
    };
  }

  /** GET /stats/classes/:id/points-timeline */
  async classPointsTimeline(
    user: AuthUser,
    classId: string,
    query: TimelineQuery,
  ): Promise<PointsTimelineBucket[]> {
    await this.assertClass(user, classId);
    const { from, to } = bounds(this.time.resolveRange(query));
    const kindFilter = query.kind ? Prisma.sql`AND p.kind = ${query.kind}::"PointKind"` : Prisma.empty;
    const gameFilter = query.gameId ? Prisma.sql`AND p.game_id = ${query.gameId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<TimelineRow[]>`
      SELECT to_char(date_trunc(${query.bucket}, p.created_at AT TIME ZONE ${this.time.timeZone}), 'YYYY-MM-DD') AS "bucketStart",
             COALESCE(SUM(p.points) FILTER (WHERE p.kind = 'GAME'), 0)::int  AS "GAME",
             COALESCE(SUM(p.points) FILTER (WHERE p.kind = 'BONUS'), 0)::int AS "BONUS"
      FROM   point_entries p
      WHERE  p.student_id IN ${membersOf([classId])}
        AND  p.created_at >= ${from} AND p.created_at < ${to}
        ${kindFilter} ${gameFilter}
      GROUP  BY 1
      ORDER  BY 1`;
    return rows.map((r) => ({
      bucketStart: r.bucketStart,
      GAME: r.GAME,
      BONUS: r.BONUS,
      total: r.GAME + r.BONUS,
    }));
  }

  /** GET /stats/classes/:id/top-students */
  async classTopStudents(user: AuthUser, classId: string, query: TopStudentsQuery): Promise<TopStudent[]> {
    await this.assertClass(user, classId);
    const entries = await this.ranking.rankingEntries(classId, {
      range: this.time.resolveRange(query),
      gameId: query.gameId ?? null,
    });
    return entries.slice(0, query.limit).map(({ rank, studentId, displayName, avatarKey, points }) => ({
      rank,
      studentId,
      displayName,
      avatarKey,
      points,
    }));
  }

  /** GET /stats/classes/:id/distribution — số học sinh theo khoảng điểm [from, to) */
  async classDistribution(
    user: AuthUser,
    classId: string,
    query: RankingQuery,
  ): Promise<DistributionBucket[]> {
    await this.assertClass(user, classId);
    const rows = await this.ranking.rankClass(this.prisma, classId, {
      range: this.time.resolveRange(query),
      gameId: query.gameId ?? null,
    });
    return distribute(rows.map((r) => r.points));
  }

  /** GET /stats/classes/:id/games — mỗi game trong catalog một dòng (0 nếu chưa chơi) */
  async classGames(user: AuthUser, classId: string, query: RangeQuery): Promise<ClassGameStats[]> {
    await this.assertClass(user, classId);
    const { from, to } = bounds(this.time.resolveRange(query));
    const members = membersOf([classId]);
    const [results, points] = await Promise.all([
      this.prisma.$queryRaw<GameResultAgg[]>`
        SELECT r.game_id                     AS "gameId",
               COUNT(*)::int                 AS rounds,
               COUNT(DISTINCT r.student_id)::int AS players,
               COALESCE(SUM(r.correct), 0)::int AS correct,
               COALESCE(SUM(r.total), 0)::int   AS total
        FROM   game_results r
        WHERE  r.student_id IN ${members} AND r.played_at >= ${from} AND r.played_at < ${to}
        GROUP  BY r.game_id`,
      this.prisma.$queryRaw<{ gameId: string; points: number }[]>`
        SELECT p.game_id AS "gameId", COALESCE(SUM(p.points), 0)::int AS points
        FROM   point_entries p
        WHERE  p.kind = 'GAME' AND p.game_id IS NOT NULL
          AND  p.student_id IN ${members} AND p.created_at >= ${from} AND p.created_at < ${to}
        GROUP  BY p.game_id`,
    ]);
    const byGame = new Map(results.map((r) => [r.gameId, r]));
    const pointsByGame = new Map(points.map((p) => [p.gameId, p.points]));
    return GAME_IDS.map((gameId) => {
      const r = byGame.get(gameId);
      return {
        gameId,
        rounds: r?.rounds ?? 0,
        players: r?.players ?? 0,
        accuracy: r && r.total > 0 ? r.correct / r.total : 0,
        points: pointsByGame.get(gameId) ?? 0,
      };
    });
  }

  /** GET /stats/games/:id/timeline — lượt xem / chơi / người chơi riêng biệt (đã đăng nhập hoặc ẩn danh) */
  async gameTimeline(gameId: string, query: GameTimelineQuery): Promise<GameTimelineBucket[]> {
    await this.assertGame(gameId);
    const { from, to } = bounds(this.time.resolveRange(query));
    return this.prisma.$queryRaw<GameTimelineBucket[]>`
      SELECT to_char(date_trunc(${query.bucket}, e.occurred_at AT TIME ZONE ${this.time.timeZone}), 'YYYY-MM-DD') AS "bucketStart",
             COUNT(*) FILTER (WHERE e.type = 'VIEW')::int AS views,
             COUNT(*) FILTER (WHERE e.type = 'PLAY')::int AS plays,
             COUNT(DISTINCT COALESCE(e.user_id::text, e.client_id::text)) FILTER (WHERE e.type = 'PLAY')::int AS "uniquePlayers"
      FROM   game_events e
      WHERE  e.game_id = ${gameId} AND e.occurred_at >= ${from} AND e.occurred_at < ${to}
      GROUP  BY 1
      ORDER  BY 1`;
  }

  /** GET /stats/games/:id/by-class — TEACHER chỉ thấy lớp mình dạy */
  async gameByClass(user: AuthUser, gameId: string, query: RangeQuery): Promise<GameByClassStats[]> {
    await this.assertGame(gameId);
    const classIds = await this.access.scopedClassIds(user);
    if (classIds && !classIds.length) return [];
    const { from, to } = bounds(this.time.resolveRange(query));
    const classFilter = classIds ? Prisma.sql`AND c.id IN (${uuidList(classIds)})` : Prisma.empty;
    return this.prisma.$queryRaw<GameByClassStats[]>`
      WITH members AS (
        SELECT m.class_id, m.student_id FROM class_memberships m WHERE m.left_at IS NULL
      ),
      res AS (
        SELECT mb.class_id, COUNT(*) AS plays, COUNT(DISTINCT r.student_id) AS players
        FROM   game_results r JOIN members mb ON mb.student_id = r.student_id
        WHERE  r.game_id = ${gameId} AND r.played_at >= ${from} AND r.played_at < ${to}
        GROUP  BY mb.class_id
      ),
      pts AS (
        SELECT mb.class_id, SUM(p.points) AS points
        FROM   point_entries p JOIN members mb ON mb.student_id = p.student_id
        WHERE  p.kind = 'GAME' AND p.game_id = ${gameId} AND p.created_at >= ${from} AND p.created_at < ${to}
        GROUP  BY mb.class_id
      )
      SELECT c.id                         AS "classId",
             c.name                       AS "className",
             COALESCE(res.plays, 0)::int   AS plays,
             COALESCE(res.players, 0)::int AS players,
             COALESCE(pts.points, 0)::int  AS points
      FROM   classes c
      LEFT JOIN res ON res.class_id = c.id
      LEFT JOIN pts ON pts.class_id = c.id
      WHERE  c.archived_at IS NULL ${classFilter}
      ORDER  BY plays DESC, c.name ASC`;
  }

  private async assertClass(user: AuthUser, classId: string): Promise<void> {
    await this.access.assertClassAccess(user, classId);
    const exists = await this.prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (!exists) throw notFound('Không tìm thấy lớp');
  }

  private async assertGame(gameId: string): Promise<void> {
    const exists = await this.prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!exists) throw notFound('Không tìm thấy game');
  }
}
