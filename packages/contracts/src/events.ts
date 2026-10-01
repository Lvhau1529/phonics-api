import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { GameId, PlayMode } from './games.js';

/**
 * Sự kiện ẩn danh của game (lượt xem = click thẻ game, lượt chơi = hoàn thành ván).
 * Client gom thành lô gửi POST /public/events; kèm bearer thì server gắn userId.
 * Dedupe theo (clientId, gameId, type, occurredAt làm tròn giây).
 */
export const GameEventType = z.enum(['VIEW', 'PLAY']);
export type GameEventType = z.infer<typeof GameEventType>;

export const EVENT_BATCH_MAX = 50;
/** Không nhận sự kiện cũ hơn (ms) — client offline lâu thì bỏ */
export const EVENT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export const GameEventInput = z.strictObject({
  gameId: GameId,
  type: GameEventType,
  mode: PlayMode.optional(),
  occurredAt: IsoDateTime,
});
export type GameEventInput = z.infer<typeof GameEventInput>;

export const EventBatchBody = z.strictObject({
  /** UUID ngẫu nhiên của thiết bị (localStorage), không phải thông tin cá nhân */
  clientId: z.uuid(),
  events: z.array(GameEventInput).min(1).max(EVENT_BATCH_MAX),
});
export type EventBatchBody = z.infer<typeof EventBatchBody>;

export const EventBatchResponse = z.object({ accepted: z.int().min(0), duplicates: z.int().min(0) });
export type EventBatchResponse = z.infer<typeof EventBatchResponse>;
