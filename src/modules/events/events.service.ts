import { Injectable } from '@nestjs/common';
import {
  EVENT_MAX_AGE_MS,
  type EventBatchBody,
  type EventBatchResponse,
  type GameEventInput,
  type GameEventType,
  type PlayMode,
} from '@phonics/contracts';
import { PrismaService } from '../../core/database/prisma.service';
import { type Tx } from '../../core/database/types';

/** Sự kiện được phép tới "tương lai" tối đa chừng này (lệch đồng hồ client) */
export const EVENT_MAX_FUTURE_MS = 60_000;

/** Dòng sẵn sàng insert vào `game_events` */
export interface EventRow {
  gameId: string;
  type: GameEventType;
  userId: string | null;
  clientId: string;
  mode: PlayMode | null;
  occurredAt: Date;
}

/** Cắt bỏ phần mili-giây (khoá dedupe `occurred_at` tính theo giây) */
export function truncateToSecond(date: Date | number | string): Date {
  const ms = typeof date === 'number' ? date : new Date(date).getTime();
  return new Date(Math.floor(ms / 1000) * 1000);
}

/**
 * Chuẩn hoá một lô sự kiện (hàm thuần, test không cần DB):
 * - `occurredAt` làm tròn xuống giây;
 * - bỏ sự kiện cũ hơn EVENT_MAX_AGE_MS hoặc đi trước `now` quá EVENT_MAX_FUTURE_MS (không tính là gì cả);
 * - bỏ gameId không có trong catalog;
 * - trùng khoá (clientId, gameId, type, occurredAt) ngay trong lô → giữ dòng đầu, tính là duplicate.
 * `valid` = số sự kiện hợp lệ (gồm cả trùng trong lô) để tính duplicates = valid − accepted.
 */
export function prepareEvents(
  input: Pick<EventBatchBody, 'clientId' | 'events'>,
  knownGames: ReadonlySet<string>,
  userId: string | null,
  now: number = Date.now(),
): { rows: EventRow[]; valid: number } {
  const rows: EventRow[] = [];
  const seen = new Set<string>();
  let valid = 0;
  for (const e of input.events) {
    const at = truncateToSecond(e.occurredAt).getTime();
    if (Number.isNaN(at) || at < now - EVENT_MAX_AGE_MS || at > now + EVENT_MAX_FUTURE_MS) continue;
    if (!knownGames.has(e.gameId)) continue;
    valid++;
    const key = `${e.gameId}|${e.type}|${at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(toRow(e, input.clientId, userId, new Date(at)));
  }
  return { rows, valid };
}

function toRow(e: GameEventInput, clientId: string, userId: string | null, occurredAt: Date): EventRow {
  return { gameId: e.gameId, type: e.type, userId, clientId, mode: e.mode ?? null, occurredAt };
}

/** Lượt xem / lượt chơi ẩn danh, dedupe bằng unique (client_id, game_id, type, occurred_at) */
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /public/events — `accepted` = số dòng insert được, `duplicates` = hợp lệ nhưng đã có */
  async ingest(body: EventBatchBody, userId: string | null): Promise<EventBatchResponse> {
    const games = await this.prisma.game.findMany({ select: { id: true } });
    const { rows, valid } = prepareEvents(body, new Set(games.map((g) => g.id)), userId);
    if (!rows.length) return { accepted: 0, duplicates: 0 };
    const { count } = await this.prisma.gameEvent.createMany({ data: rows, skipDuplicates: true });
    return { accepted: count, duplicates: valid - count };
  }

  /**
   * Ghi lượt chơi từ phía server khi học sinh nộp kết quả ván (POST /game/results), trong cùng transaction.
   * `clientId` là cột uuid bắt buộc; nếu không có thì dùng chính `userId` (đã là uuid) để khoá dedupe
   * ổn định giữa các lần gửi lại — randomUUID() sẽ phá dedupe. Client cũng có thể đã gửi PLAY cùng giây
   * với clientId của thiết bị; hai dòng đó khác client_id nên không gộp (chấp nhận, đếm "plays" xấp xỉ).
   */
  async recordPlay(
    tx: Tx,
    input: { gameId: string; userId: string; clientId?: string; mode: PlayMode; occurredAt: Date },
  ): Promise<void> {
    await tx.gameEvent.createMany({
      data: [
        {
          gameId: input.gameId,
          type: 'PLAY',
          userId: input.userId,
          clientId: input.clientId ?? input.userId,
          mode: input.mode,
          occurredAt: truncateToSecond(input.occurredAt),
        },
      ],
      skipDuplicates: true,
    });
  }
}
