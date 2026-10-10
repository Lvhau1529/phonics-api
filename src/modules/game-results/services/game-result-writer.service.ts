import { Injectable } from '@nestjs/common';
import { type GameResultBody, type GameResultResponse, type PointsReason } from '@phonics/contracts';
import { AppError } from '../../../common/errors/app-error';
import { POINT_RULES } from '../../../config/constants';
import { TimeService } from '../../../core/time/time.service';
import { type Prisma } from '../../../generated/prisma/client';
import { EventsService } from '../../events/services/events.service';
import { GameUnlockService } from '../../games/services/game-unlock.service';
import { PointReaderService } from '../../points/services/point-reader.service';
import { type RankChange, RankingService } from '../../points/services/ranking.service';
import { GameResultRepository } from '../repositories/game-result.repository';
import { type ResultRow } from '../types/game-result.types';
import { assertResultPlausible, computePoints, isUniqueViolation } from '../utils/game-result-rules';

/**
 * Kết quả ván SOLO từ game client. Đây là lõi của hệ thống điểm: mỗi ván hợp lệ sinh đúng một bút toán
 * GAME trong sổ điểm (point_entries.game_result_id unique) và một PLAY event; idempotent theo
 * (studentId, clientSessionId).
 */
@Injectable()
export class GameResultWriterService {
  constructor(
    private readonly repo: GameResultRepository,
    private readonly games: GameUnlockService,
    private readonly ranking: RankingService,
    private readonly points: PointReaderService,
    private readonly events: EventsService,
    private readonly time: TimeService,
  ) {}

  /** POST /game/results */
  async submit(studentId: string, body: GameResultBody): Promise<GameResultResponse> {
    assertResultPlausible(body);

    // 1. Idempotency: ván đã ghi → trả lại, không cộng thêm
    const existing = await this.repo.findBySession(studentId, body.clientSessionId);
    if (existing) return this.respond(existing, true, null);

    // 2. Ghi kết quả + điểm + hạng + PLAY event trong một transaction
    let outcome: { row: ResultRow; rank: RankChange | null };
    try {
      outcome = await this.repo.transaction(async (tx) => {
        const classId = await this.repo.currentClassId(tx, studentId);

        const game = await this.games.isUnlockedFor(tx, studentId, body.gameId);
        if (!game.exists) throw new AppError('UNKNOWN_GAME', 400);

        let usedToday = 0;
        if (POINT_RULES.dailyCap !== null && game.enabled && game.unlocked && classId) {
          usedToday = await this.repo.gamePointsIn(tx, studentId, this.time.dayRange());
        }
        const { points, reason } = computePoints(body.correct, game, classId, usedToday);

        const row = await this.repo.create(tx, {
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
        });

        let rank: RankChange | null = null;
        if (points > 0 && classId) {
          await this.repo.createGamePoints(tx, {
            studentId,
            classId,
            gameId: body.gameId,
            points,
            gameResultId: row.id,
            note: `${body.gameId} · ${body.levelId} · ${body.correct}/${body.total}`,
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
      const winner = await this.repo.findBySession(studentId, body.clientSessionId);
      if (!winner) throw e;
      return this.respond(winner, true, null);
    }

    return this.respond(outcome.row, false, outcome.rank);
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
