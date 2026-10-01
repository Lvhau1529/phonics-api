import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { RangeQuery } from './common/range.js';
import { GameId } from './games.js';
import { AvatarKey, DisplayName } from './users.js';

export const PointKind = z.enum(['GAME', 'BONUS']);
export type PointKind = z.infer<typeof PointKind>;

/** Một dòng sổ điểm */
export const PointEntryView = z.object({
  id: Id,
  studentId: Id,
  studentName: DisplayName,
  classId: Id.nullable(),
  className: z.string().nullable(),
  gameId: GameId.nullable(),
  kind: PointKind,
  points: z.int(),
  note: z.string().nullable(),
  gameResultId: Id.nullable(),
  createdById: Id.nullable(),
  createdByName: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type PointEntryView = z.infer<typeof PointEntryView>;

export const PointsListQuery = PageQuery.extend(RangeQuery.shape).extend({
  kind: PointKind.optional(),
  gameId: GameId.optional(),
  studentId: Id.optional(),
  classId: Id.optional(),
});
export type PointsListQuery = z.infer<typeof PointsListQuery>;

export const RankingQuery = RangeQuery.extend({ gameId: GameId.optional() });
export type RankingQuery = z.infer<typeof RankingQuery>;

export const RankingEntry = z.object({
  /** RANK(): 1, 1, 3 — bằng điểm thì cùng hạng */
  rank: z.int().min(1),
  studentId: Id,
  displayName: DisplayName,
  avatarKey: AvatarKey,
  points: z.int(),
  isMe: z.boolean(),
});
export type RankingEntry = z.infer<typeof RankingEntry>;

export const RankingResponse = z.object({
  classId: Id,
  className: z.string(),
  gameId: GameId.nullable(),
  range: RangeQuery,
  items: z.array(RankingEntry),
  /** Dòng của chính người xem (null nếu không phải học sinh của lớp) */
  me: RankingEntry.nullable(),
});
export type RankingResponse = z.infer<typeof RankingResponse>;

export const PointsByGame = z.object({ gameId: GameId, points: z.int(), rounds: z.int().min(0) });
export type PointsByGame = z.infer<typeof PointsByGame>;

/** GET /me/points */
export const MyPointsResponse = z.object({
  total: z.int(),
  byKind: z.object({ GAME: z.int(), BONUS: z.int() }),
  byGame: z.array(PointsByGame),
  class: z
    .object({ id: Id, name: z.string(), rank: z.int().min(1).nullable(), members: z.int().min(0) })
    .nullable(),
  range: RangeQuery,
});
export type MyPointsResponse = z.infer<typeof MyPointsResponse>;

export const BonusPoints = z
  .int()
  .min(-100)
  .max(100)
  .refine((n) => n !== 0, { message: 'Điểm phải khác 0' });

export const AwardBonusBody = z.strictObject({
  studentId: Id,
  points: BonusPoints,
  note: z.string().trim().min(1).max(200),
  gameId: GameId.optional(),
});
export type AwardBonusBody = z.infer<typeof AwardBonusBody>;

export const AwardBonusBatchBody = z.strictObject({ entries: z.array(AwardBonusBody).min(1).max(100) });
export type AwardBonusBatchBody = z.infer<typeof AwardBonusBatchBody>;

export const AwardBonusResponse = z.object({
  entry: PointEntryView,
  rank: z.object({ previous: z.int().min(1).nullable(), current: z.int().min(1).nullable() }),
});
export type AwardBonusResponse = z.infer<typeof AwardBonusResponse>;

export const AwardBonusBatchResponse = z.object({ entries: z.array(PointEntryView) });
export type AwardBonusBatchResponse = z.infer<typeof AwardBonusBatchResponse>;
