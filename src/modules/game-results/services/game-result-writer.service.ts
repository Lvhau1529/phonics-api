import { Injectable } from '@nestjs/common';
import { type GameResultBody, type GameResultResponse, type PointsReason } from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { isUniqueViolation } from '@/common/utils/prisma-errors';
import { POINT_RULES } from '@/config/constants';
import { TimeService } from '@/core/time/time.service';
import { type Prisma } from '@/generated/prisma/client';
import { EventsService } from '@/modules/events/services/events.service';
import { GameUnlockService } from '@/modules/games/services/game-unlock.service';
import { PointReaderService } from '@/modules/points/services/point-reader.service';
import { GameResultRepository } from '@/modules/game-results/repositories/game-result.repository';
import { type ResultRow } from '@/modules/game-results/types/game-result.types';
import { assertResultPlausible, computePoints } from '@/modules/game-results/utils/game-result-rules';

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
    private readonly points: PointReaderService,
    private readonly events: EventsService,
    private readonly time: TimeService,
  ) {}

  /** POST /game/results */
  async submit(studentId: string, body: GameResultBody): Promise<GameResultResponse> {
    assertResultPlausible(body);

    // 1. Idempotency: ván đã ghi → trả lại, không cộng thêm
    const existing = await this.repo.findBySession(studentId, body.clientSessionId);
    if (existing) return this.respond(existing, true);

    // 2. Ghi kết quả + điểm + PLAY event trong một transaction
    let row: ResultRow;
    try {
      row = await this.repo.transaction(async (tx) => {
        const classId = await this.repo.currentClassId(tx, studentId);

        const game = await this.games.isUnlockedFor(tx, studentId, body.gameId);
        if (!game.exists) throw new AppError('UNKNOWN_GAME', 400);

        let usedToday = 0;
        if (POINT_RULES.dailyCap !== null && game.enabled && game.unlocked && classId) {
          usedToday = await this.repo.gamePointsIn(tx, studentId, this.time.dayRange());
        }
        const { points, reason } = computePoints(body.correct, game, classId, usedToday);

        const created = await this.repo.create(tx, {
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

        if (points > 0 && classId) {
          await this.repo.createGamePoints(tx, {
            studentId,
            classId,
            gameId: body.gameId,
            points,
            gameResultId: created.id,
            note: `${body.gameId} · ${body.levelId} · ${body.correct}/${body.total}`,
          });
        }

        await this.events.recordPlay(tx, {
          gameId: body.gameId,
          userId: studentId,
          mode: 'solo',
          occurredAt: new Date(body.playedAt),
        });
        return created;
      });
    } catch (e) {
      // Hai request cùng clientSessionId chạy song song: request thua unique → coi như gửi lại.
      // Phải bắt NGOÀI transaction vì Postgres huỷ cả transaction khi một câu lệnh lỗi.
      if (!isUniqueViolation(e)) throw e;
      const winner = await this.repo.findBySession(studentId, body.clientSessionId);
      if (!winner) throw e;
      return this.respond(winner, true);
    }

    return this.respond(row, false);
  }

  /** Dựng response: tổng điểm (mọi thời gian / hôm nay / game này) */
  private async respond(row: ResultRow, duplicate: boolean): Promise<GameResultResponse> {
    const [all, today] = await Promise.all([
      this.points.totals(row.studentId, null),
      this.points.totals(row.studentId, this.time.dayRange()),
    ]);
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
    };
  }
}
