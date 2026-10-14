import { Injectable } from '@nestjs/common';
import { type DateRange } from '@/core/time/time.service';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import { type ResultRow } from '@/modules/game-results/types/game-result.types';

/** Truy cập game_results (+ bút toán GAME đi kèm trong point_entries) */
@Injectable()
export class GameResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /** Ván đã ghi theo khoá idempotency (studentId, clientSessionId) */
  findBySession(studentId: string, clientSessionId: string): Promise<ResultRow | null> {
    return this.prisma.gameResult.findUnique({
      where: { studentId_clientSessionId: { studentId, clientSessionId } },
    });
  }

  findPage(where: Prisma.GameResultWhereInput, args: { skip: number; take: number }): Promise<ResultRow[]> {
    return this.prisma.gameResult.findMany({ where, ...args, orderBy: { playedAt: 'desc' } });
  }

  count(where: Prisma.GameResultWhereInput): Promise<number> {
    return this.prisma.gameResult.count({ where });
  }

  async currentClassId(tx: Tx, studentId: string): Promise<string | null> {
    const membership = await tx.classMembership.findFirst({
      where: { studentId, leftAt: null },
      select: { classId: true },
    });
    return membership?.classId ?? null;
  }

  /** Điểm GAME học sinh đã nhận trong khoảng (dùng cho trần ngày) */
  async gamePointsIn(tx: Tx, studentId: string, range: DateRange): Promise<number> {
    const agg = await tx.pointEntry.aggregate({
      where: { studentId, kind: 'GAME', createdAt: { gte: range.from, lt: range.to } },
      _sum: { points: true },
    });
    return agg._sum.points ?? 0;
  }

  create(tx: Tx, data: Prisma.GameResultUncheckedCreateInput): Promise<ResultRow> {
    return tx.gameResult.create({ data });
  }

  /** Bút toán GAME gắn với ván (point_entries.game_result_id unique) */
  async createGamePoints(
    tx: Tx,
    data: {
      studentId: string;
      classId: string;
      gameId: string;
      points: number;
      gameResultId: string;
      note: string;
    },
  ): Promise<void> {
    await tx.pointEntry.create({ data: { ...data, kind: 'GAME' } });
  }
}
