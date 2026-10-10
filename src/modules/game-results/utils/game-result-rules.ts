/** Luật kết quả ván / điểm GAME — hàm thuần để test */
import { type GameResultBody, type PointsReason } from '@phonics/contracts';
import { AppError } from '../../../common/errors/app-error';
import { GAME_REGISTRY, POINT_RULES } from '../../../config/constants';
import { Prisma } from '../../../generated/prisma/client';

/** playedAt được phép đi trước đồng hồ server tối đa chừng này (lệch giờ client) */
const PLAYED_AT_MAX_FUTURE_MS = 60_000;

/** Vi phạm unique (studentId, clientSessionId) → hai request cùng ván chạy song song */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * rawPoints = min(maxPerRound, correct × perCorrect), rồi giảm theo trạng thái game / lớp / trần ngày.
 * `usedToday` = điểm GAME đã nhận hôm nay (chỉ cần khi có dailyCap).
 */
export function computePoints(
  correct: number,
  game: { enabled: boolean; unlocked: boolean },
  classId: string | null,
  usedToday: number,
): { points: number; reason: PointsReason | null } {
  const raw = Math.min(POINT_RULES.maxPerRound, correct * POINT_RULES.perCorrect);
  if (!game.enabled) return { points: 0, reason: 'GAME_DISABLED' };
  if (!game.unlocked) return { points: 0, reason: 'GAME_LOCKED' };
  if (!classId) return { points: 0, reason: 'NO_CLASS' };
  if (POINT_RULES.dailyCap !== null) {
    const remaining = Math.max(0, POINT_RULES.dailyCap - usedToday);
    if (raw > remaining) return { points: remaining, reason: 'DAILY_CAP' };
  }
  return { points: raw, reason: null };
}

/** Kiểm tra tĩnh trước khi chạm DB (400) */
export function assertResultPlausible(body: GameResultBody, now = Date.now()): void {
  const limits = GAME_REGISTRY[body.gameId];
  if (!limits) throw new AppError('UNKNOWN_GAME', 400);
  if (body.total > limits.maxTotal || body.score > limits.maxScore) {
    throw new AppError('RESULT_IMPLAUSIBLE', 400, {
      details: { total: [`total ≤ ${limits.maxTotal}`], score: [`score ≤ ${limits.maxScore}`] },
    });
  }
  const playedAt = new Date(body.playedAt).getTime();
  if (playedAt > now + PLAYED_AT_MAX_FUTURE_MS || playedAt < now - POINT_RULES.playedAtMaxAgeMs) {
    throw new AppError('PLAYED_AT_OUT_OF_RANGE', 400);
  }
  if (JSON.stringify(body.details ?? {}).length > POINT_RULES.maxDetailsBytes) {
    throw new AppError('DETAILS_TOO_LARGE', 400);
  }
}
