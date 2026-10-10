import { Injectable } from '@nestjs/common';
import {
  type Bucket,
  type GameByClassStats,
  type GameTimelineBucket,
  type PointKind,
} from '@phonics/contracts';
import { type DateRange } from '../../../core/time/time.service';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  type GameResultAgg,
  type OverviewActivity,
  type OverviewCounts,
  type TimelineRow,
} from '../types/stats.types';

const EPOCH = new Date(0);
const FAR_FUTURE = new Date('2100-01-01T00:00:00Z');

/** [from, to) dùng được trong SQL (null = không giới hạn) */
const bounds = (range: DateRange | null): DateRange => range ?? { from: EPOCH, to: FAR_FUTURE };

/** `IN (uuid, uuid, …)` — caller đảm bảo danh sách không rỗng */
const uuidList = (ids: readonly string[]): Prisma.Sql =>
  Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/**
 * Subquery học sinh đang là thành viên của một / nhiều lớp. Điểm và kết quả ĐI THEO HỌC SINH,
 * nên mọi thống kê theo lớp lọc theo `student_id IN (thành viên hiện tại)` thay vì `class_id`.
 */
const membersOf = (classIds: readonly string[]): Prisma.Sql =>
  Prisma.sql`(SELECT m.student_id FROM class_memberships m
              WHERE m.left_at IS NULL AND m.class_id IN (${uuidList(classIds)}))`;

/**
 * SQL thống kê cho admin / giáo viên. Mốc thời gian (ngày, tuần) theo APP_TIMEZONE:
 * `date_trunc(bucket, ts AT TIME ZONE tz)`; tuần của Postgres bắt đầu Thứ Hai (khớp TimeService).
 */
@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async classExists(classId: string): Promise<boolean> {
    return !!(await this.prisma.class.findUnique({ where: { id: classId }, select: { id: true } }));
  }

  async gameExists(gameId: string): Promise<boolean> {
    return !!(await this.prisma.game.findUnique({ where: { id: gameId }, select: { id: true } }));
  }

  // ---------- tổng quan ----------

  async globalCounts(): Promise<OverviewCounts> {
    const [students, teachers, classes] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
      this.prisma.class.count({ where: { archivedAt: null } }),
    ]);
    return { students, teachers, classes };
  }

  async scopedCounts(classIds: readonly string[]): Promise<OverviewCounts> {
    const ids = uuidList(classIds);
    const [row] = await this.prisma.$queryRaw<[OverviewCounts]>`
      SELECT (SELECT COUNT(DISTINCT m.student_id) FROM class_memberships m
               WHERE m.left_at IS NULL AND m.class_id IN (${ids}))::int                 AS students,
             (SELECT COUNT(DISTINCT t.teacher_id) FROM class_teachers t
               WHERE t.class_id IN (${ids}))::int                                        AS teachers,
             (SELECT COUNT(*) FROM classes c WHERE c.archived_at IS NULL AND c.id IN (${ids}))::int AS classes`;
    return row;
  }

  /** Hoạt động trong khoảng: điểm, ván, lượt xem / chơi, học sinh có chơi (lọc theo thành viên lớp nếu có scope) */
  async activity(range: DateRange, classIds: readonly string[] | undefined): Promise<OverviewActivity> {
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

  // ---------- lớp ----------

  pointsTimeline(
    classId: string,
    range: DateRange | null,
    opts: { bucket: Bucket; timeZone: string; kind?: PointKind; gameId?: string },
  ): Promise<TimelineRow[]> {
    const { from, to } = bounds(range);
    const kindFilter = opts.kind ? Prisma.sql`AND p.kind = ${opts.kind}::"PointKind"` : Prisma.empty;
    const gameFilter = opts.gameId ? Prisma.sql`AND p.game_id = ${opts.gameId}` : Prisma.empty;
    return this.prisma.$queryRaw<TimelineRow[]>`
      SELECT to_char(date_trunc(${opts.bucket}, p.created_at AT TIME ZONE ${opts.timeZone}), 'YYYY-MM-DD') AS "bucketStart",
             COALESCE(SUM(p.points) FILTER (WHERE p.kind = 'GAME'), 0)::int  AS "GAME",
             COALESCE(SUM(p.points) FILTER (WHERE p.kind = 'BONUS'), 0)::int AS "BONUS"
      FROM   point_entries p
      WHERE  p.student_id IN ${membersOf([classId])}
        AND  p.created_at >= ${from} AND p.created_at < ${to}
        ${kindFilter} ${gameFilter}
      GROUP  BY 1
      ORDER  BY 1`;
  }

  /** Ván / người chơi / đúng-sai và điểm GAME theo game của thành viên lớp */
  async classGameAggregates(
    classId: string,
    range: DateRange | null,
  ): Promise<{ results: GameResultAgg[]; points: { gameId: string; points: number }[] }> {
    const { from, to } = bounds(range);
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
    return { results, points };
  }

  // ---------- game ----------

  /** Lượt xem / chơi / người chơi riêng biệt (đã đăng nhập hoặc ẩn danh) */
  gameTimeline(
    gameId: string,
    range: DateRange | null,
    opts: { bucket: Bucket; timeZone: string },
  ): Promise<GameTimelineBucket[]> {
    const { from, to } = bounds(range);
    return this.prisma.$queryRaw<GameTimelineBucket[]>`
      SELECT to_char(date_trunc(${opts.bucket}, e.occurred_at AT TIME ZONE ${opts.timeZone}), 'YYYY-MM-DD') AS "bucketStart",
             COUNT(*) FILTER (WHERE e.type = 'VIEW')::int AS views,
             COUNT(*) FILTER (WHERE e.type = 'PLAY')::int AS plays,
             COUNT(DISTINCT COALESCE(e.user_id::text, e.client_id::text)) FILTER (WHERE e.type = 'PLAY')::int AS "uniquePlayers"
      FROM   game_events e
      WHERE  e.game_id = ${gameId} AND e.occurred_at >= ${from} AND e.occurred_at < ${to}
      GROUP  BY 1
      ORDER  BY 1`;
  }

  /** Lượt chơi / người chơi / điểm theo lớp (`classIds` undefined = mọi lớp chưa lưu trữ) */
  gameByClass(
    gameId: string,
    range: DateRange | null,
    classIds: readonly string[] | undefined,
  ): Promise<GameByClassStats[]> {
    const { from, to } = bounds(range);
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
}
