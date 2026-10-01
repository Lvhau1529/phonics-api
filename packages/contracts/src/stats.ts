import { z } from 'zod';
import { IsoDate, IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { RangeQuery } from './common/range.js';
import { GameId } from './games.js';
import { PointKind } from './points.js';
import { AvatarKey, DisplayName } from './users.js';

export const Bucket = z.enum(['day', 'week']);
export type Bucket = z.infer<typeof Bucket>;

export const TimelineQuery = RangeQuery.extend({
  bucket: Bucket.default('day'),
  kind: PointKind.optional(),
  gameId: GameId.optional(),
});
export type TimelineQuery = z.infer<typeof TimelineQuery>;

export const OverviewStats = z.object({
  students: z.int().min(0),
  teachers: z.int().min(0),
  classes: z.int().min(0),
  /** 7 ngày gần nhất */
  pointsLast7d: z.int(),
  roundsLast7d: z.int().min(0),
  viewsLast7d: z.int().min(0),
  playsLast7d: z.int().min(0),
  activeStudentsLast7d: z.int().min(0),
  generatedAt: IsoDateTime,
});
export type OverviewStats = z.infer<typeof OverviewStats>;

export const PointsTimelineBucket = z.object({
  /** Ngày đầu bucket theo APP_TIMEZONE */
  bucketStart: IsoDate,
  GAME: z.int(),
  BONUS: z.int(),
  total: z.int(),
});
export type PointsTimelineBucket = z.infer<typeof PointsTimelineBucket>;

export const TopStudent = z.object({
  rank: z.int().min(1),
  studentId: Id,
  displayName: DisplayName,
  avatarKey: AvatarKey,
  points: z.int(),
});
export type TopStudent = z.infer<typeof TopStudent>;

export const DistributionBucket = z.object({ from: z.int(), to: z.int(), count: z.int().min(0) });
export type DistributionBucket = z.infer<typeof DistributionBucket>;

/** Thống kê một game trong một lớp */
export const ClassGameStats = z.object({
  gameId: GameId,
  rounds: z.int().min(0),
  players: z.int().min(0),
  /** sum(correct) / sum(total), 0–1 */
  accuracy: z.number().min(0).max(1),
  points: z.int(),
});
export type ClassGameStats = z.infer<typeof ClassGameStats>;

export const GameTimelineBucket = z.object({
  bucketStart: IsoDate,
  views: z.int().min(0),
  plays: z.int().min(0),
  uniquePlayers: z.int().min(0),
});
export type GameTimelineBucket = z.infer<typeof GameTimelineBucket>;

export const GameByClassStats = z.object({
  classId: Id,
  className: z.string(),
  plays: z.int().min(0),
  players: z.int().min(0),
  points: z.int(),
});
export type GameByClassStats = z.infer<typeof GameByClassStats>;
