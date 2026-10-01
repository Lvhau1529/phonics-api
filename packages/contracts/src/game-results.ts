import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { EndedBy, GameId } from './games.js';

/** Luật quy đổi điểm (API là nguồn sự thật; client chỉ dùng để hiện ước lượng) */
export const POINT_RULES = {
  /** Điểm cho mỗi câu / từ đúng — khớp GEM_RULES.perCorrect của ví kim cương */
  perCorrect: 1,
  /** Tối đa mỗi ván — khớp GEM_RULES.maxPerSession */
  maxPerRound: 10,
  /** Tối đa điểm GAME mỗi ngày (APP_TIMEZONE); null = không giới hạn */
  dailyCap: 60 as number | null,
  /** Kích thước tối đa của `details` (byte JSON) */
  maxDetailsBytes: 8_000,
  /** playedAt được phép cũ tới đây (chơi offline rồi đồng bộ) */
  playedAtMaxAgeMs: 24 * 3600 * 1000,
} as const;

/** Kết quả một ván SOLO do game client gửi lên (POST /game/results) */
export const GameResultBody = z
  .strictObject({
    /** UUID sinh ở client khi bắt đầu ván — khoá idempotent */
    clientSessionId: z.uuid(),
    gameId: GameId,
    mode: z.literal('solo'),
    levelId: z.string().trim().min(1).max(40),
    packId: z.string().trim().min(1).max(40).optional(),
    correct: z.int().min(0),
    total: z.int().min(1).max(200),
    score: z.int().min(0).max(1_000_000),
    durationMs: z.int().min(0).max(3_600_000).optional(),
    endedBy: EndedBy,
    playedAt: IsoDateTime,
    /** Dữ liệu riêng từng game (từ sai, sao, streak...), lưu JSON */
    details: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((r) => r.correct <= r.total, { message: 'correct phải ≤ total', path: ['correct'] });
export type GameResultBody = z.infer<typeof GameResultBody>;

/** Vì sao điểm nhận được thấp hơn điểm tính từ số câu đúng */
export const PointsReason = z.enum(['DAILY_CAP', 'NO_CLASS', 'GAME_LOCKED', 'GAME_DISABLED']);
export type PointsReason = z.infer<typeof PointsReason>;

export const GameResultResponse = z.object({
  resultId: Id,
  /** true = ván này đã được ghi trước đó (gửi lại), không cộng thêm */
  duplicate: z.boolean(),
  pointsAwarded: z.int().min(0),
  pointsReason: PointsReason.optional(),
  totals: z.object({ all: z.int(), today: z.int(), game: z.int() }),
  rank: z.object({ previous: z.int().min(1).nullable(), current: z.int().min(1).nullable() }),
});
export type GameResultResponse = z.infer<typeof GameResultResponse>;

export const GameResultView = z.object({
  id: Id,
  studentId: Id,
  classId: Id.nullable(),
  gameId: GameId,
  mode: z.literal('solo'),
  levelId: z.string(),
  packId: z.string().nullable(),
  correct: z.int(),
  total: z.int(),
  score: z.int(),
  durationMs: z.int().nullable(),
  endedBy: EndedBy,
  playedAt: IsoDateTime,
  pointsAwarded: z.int(),
  details: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTime,
});
export type GameResultView = z.infer<typeof GameResultView>;

export const GameResultListQuery = PageQuery.extend({ gameId: GameId.optional() });
export type GameResultListQuery = z.infer<typeof GameResultListQuery>;
