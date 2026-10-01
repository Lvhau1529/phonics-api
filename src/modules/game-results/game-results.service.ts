import { Injectable } from '@nestjs/common';
import {
  type EndedBy,
  type GameId,
  type GameResultBody,
  type GameResultListQuery,
  type GameResultResponse,
  type GameResultView,
  type Paginated,
  type PointsReason,
} from '@phonics/contracts';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/utils/paginate';
import { GAME_REGISTRY, POINT_RULES } from '../../config/constants';
import { PrismaService } from '../../core/database/prisma.service';
import { TimeService } from '../../core/time/time.service';
import { Prisma } from '../../generated/prisma/client';
import { EventsService } from '../events/events.service';
import { GamesService } from '../games/games.service';
import { PointsService } from '../points/points.service';
import { type RankChange, RankingService } from '../points/ranking.service';

/** playedAt được phép đi trước đồng hồ server tối đa chừng này (lệch giờ client) */
const PLAYED_AT_MAX_FUTURE_MS = 60_000;

/** Dòng `game_results` (các cột dùng để dựng response / view) */
interface ResultRow {
  id: string;
  studentId: string;
  classId: string | null;
  gameId: string;
  mode: string;
  levelId: string;
  packId: string | null;
  correct: number;
  total: number;
  score: number;
  durationMs: number | null;
  endedBy: string;
  playedAt: Date;
  pointsAwarded: number;
  pointsReason: string | null;
  details: unknown;
  createdAt: Date;
}

/** Vi phạm unique (studentId, clientSessionId) → hai request cùng ván chạy song song */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Luật điểm (hàm thuần để test): rawPoints = min(maxPerRound, correct × perCorrect), rồi giảm theo
 * trạng thái game / lớp / trần ngày. `usedToday` = điểm GAME đã nhận hôm nay (chỉ cần khi có dailyCap).
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

export function toResultView(row: ResultRow): GameResultView {
  return {
    id: row.id,
    studentId: row.studentId,
    classId: row.classId,
    gameId: row.gameId as GameId,
    mode: 'solo',
    levelId: row.levelId,
    packId: row.packId,
    correct: row.correct,
    total: row.total,
    score: row.score,
    durationMs: row.durationMs,
    endedBy: row.endedBy as EndedBy,
    playedAt: row.playedAt.toISOString(),
    pointsAwarded: row.pointsAwarded,
    details: (row.details as Record<string, unknown> | null) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Kết quả ván SOLO từ game client. Đây là lõi của hệ thống điểm: mỗi ván hợp lệ sinh đúng một bút toán
 * GAME trong sổ điểm (point_entries.game_result_id unique) và một PLAY event; idempotent theo
 * (studentId, clientSessionId).
 */
@Injectable()
export class GameResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
    private readonly ranking: RankingService,
    private readonly points: PointsService,
    private readonly events: EventsService,
    private readonly time: TimeService,
  ) {}

  /** POST /game/results */
  async submit(studentId: string, body: GameResultBody): Promise<GameResultResponse> {
    this.validate(body);

    // 1. Idempotency: ván đã ghi → trả lại, không cộng thêm
    const existing = await this.findExisting(studentId, body.clientSessionId);
    if (existing) return this.respond(existing, true, null);

    // 2. Ghi kết quả + điểm + hạng + PLAY event trong một transaction
    let outcome: { row: ResultRow; rank: RankChange | null };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const membership = await tx.classMembership.findFirst({
          where: { studentId, leftAt: null },
          select: { classId: true },
        });
        const classId = membership?.classId ?? null;

        const game = await this.games.isUnlockedFor(tx, studentId, body.gameId);
        if (!game.exists) throw new AppError('UNKNOWN_GAME', 400);

        let usedToday = 0;
        if (POINT_RULES.dailyCap !== null && game.enabled && game.unlocked && classId) {
          const day = this.time.dayRange();
          const agg = await tx.pointEntry.aggregate({
            where: { studentId, kind: 'GAME', createdAt: { gte: day.from, lt: day.to } },
            _sum: { points: true },
          });
          usedToday = agg._sum.points ?? 0;
        }
        const { points, reason } = computePoints(body.correct, game, classId, usedToday);

        const row = await tx.gameResult.create({
          data: {
            studentId,
            classId,
            gameId: body.gameId,
            mode: body.mode,
            levelId: body.levelId,
            packId: body.packId,
            correct: body.correct,
            total: body.total,
            score: body.score,
            durationMs: body.durationMs,
            endedBy: body.endedBy,
            playedAt: new Date(body.playedAt),
            clientSessionId: body.clientSessionId,
            pointsAwarded: points,
            pointsReason: reason,
            details: body.details as Prisma.InputJsonValue,
          },
        });

        let rank: RankChange | null = null;
        if (points > 0 && classId) {
          await tx.pointEntry.create({
            data: {
              studentId,
              classId,
              gameId: body.gameId,
              kind: 'GAME',
              points,
              gameResultId: row.id,
              note: `${body.gameId} · ${body.levelId} · ${body.correct}/${body.total}`,
            },
          });
          rank = await this.ranking.recomputeAndNotify(tx, classId, studentId);
        }

        await this.events.recordPlay(tx, {
          gameId: body.gameId,
          userId: studentId,
          mode: 'solo',
          occurredAt: new Date(body.playedAt),
        });
        return { row, rank };
      });
    } catch (e) {
      // Hai request cùng clientSessionId chạy song song: request thua unique → coi như gửi lại.
      // Phải bắt NGOÀI transaction vì Postgres huỷ cả transaction khi một câu lệnh lỗi.
      if (!isUniqueViolation(e)) throw e;
      const winner = await this.findExisting(studentId, body.clientSessionId);
      if (!winner) throw e;
      return this.respond(winner, true, null);
    }

    return this.respond(outcome.row, false, outcome.rank);
  }

  /** GET /me/game-results — mới nhất trước */
  async listMine(studentId: string, query: GameResultListQuery): Promise<Paginated<GameResultView>> {
    const where: Prisma.GameResultWhereInput = { studentId, gameId: query.gameId };
    return paginate(
      query,
      async (args) =>
        (await this.prisma.gameResult.findMany({ where, ...args, orderBy: { playedAt: 'desc' } })).map(
          toResultView,
        ),
      () => this.prisma.gameResult.count({ where }),
    );
  }

  /** Kiểm tra tĩnh trước khi chạm DB (400) */
  private validate(body: GameResultBody): void {
    const limits = GAME_REGISTRY[body.gameId];
    if (!limits) throw new AppError('UNKNOWN_GAME', 400);
    if (body.total > limits.maxTotal || body.score > limits.maxScore) {
      throw new AppError('RESULT_IMPLAUSIBLE', 400, {
        details: { total: [`total ≤ ${limits.maxTotal}`], score: [`score ≤ ${limits.maxScore}`] },
      });
    }
    const playedAt = new Date(body.playedAt).getTime();
    const now = Date.now();
    if (playedAt > now + PLAYED_AT_MAX_FUTURE_MS || playedAt < now - POINT_RULES.playedAtMaxAgeMs) {
      throw new AppError('PLAYED_AT_OUT_OF_RANGE', 400);
    }
    if (JSON.stringify(body.details ?? {}).length > POINT_RULES.maxDetailsBytes) {
      throw new AppError('DETAILS_TOO_LARGE', 400);
    }
  }

  private findExisting(studentId: string, clientSessionId: string): Promise<ResultRow | null> {
    return this.prisma.gameResult.findUnique({
      where: { studentId_clientSessionId: { studentId, clientSessionId } },
    });
  }

  /** Dựng response: tổng điểm (mọi thời gian / hôm nay / game này) + hạng hiện tại */
  private async respond(
    row: ResultRow,
    duplicate: boolean,
    rank: RankChange | null,
  ): Promise<GameResultResponse> {
    const [all, today] = await Promise.all([
      this.points.totals(row.studentId, null),
      this.points.totals(row.studentId, this.time.dayRange()),
    ]);
    let change = rank;
    if (!change) {
      // Không có bút toán mới (0 điểm / gửi lại) → hạng không đổi
      const current = (await this.ranking.currentRank(row.studentId))?.rank ?? null;
      change = { previous: current, current };
    }
    return {
      resultId: row.id,
      duplicate,
      pointsAwarded: row.pointsAwarded,
      pointsReason: (row.pointsReason as PointsReason | null) ?? undefined,
      totals: {
        all: all.total,
        today: today.total,
        game: all.byGame.find((g) => g.gameId === row.gameId)?.points ?? 0,
      },
      rank: change,
    };
  }
}
