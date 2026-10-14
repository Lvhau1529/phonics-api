import { Injectable } from '@nestjs/common';
import {
  type MyPointsResponse,
  type Paginated,
  type PointEntryView,
  type PointsByGame,
  type PointsListQuery,
  type RankingQuery,
  type RankingResponse,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { paginate } from '@/common/utils/paginate';
import { TimeService } from '@/core/time/time.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toEntryView } from '@/modules/points/dto/responses/point-entry.view';
import { PointRepository } from '@/modules/points/repositories/point.repository';
import { RankingService } from '@/modules/points/services/ranking.service';

/** Đọc điểm: tổng theo học sinh, sổ điểm, bảng xếp hạng lớp */
@Injectable()
export class PointReaderService {
  constructor(
    private readonly repo: PointRepository,
    private readonly ranking: RankingService,
    private readonly time: TimeService,
  ) {}

  /** Tổng điểm của học sinh theo khoảng thời gian (+ theo game) */
  async totals(studentId: string, range: { from: Date; to: Date } | null, tx?: Tx) {
    const where: Prisma.PointEntryWhereInput = {
      studentId,
      createdAt: range ? { gte: range.from, lt: range.to } : undefined,
    };
    const [byKind, byGame] = await Promise.all([
      this.repo.sumByKind(where, tx),
      this.repo.sumByGame(where, tx),
    ]);
    const kind = { GAME: 0, BONUS: 0 };
    for (const k of byKind) kind[k.kind] = k._sum.points ?? 0;
    const games: PointsByGame[] = byGame.map((g) => ({
      gameId: g.gameId as PointsByGame['gameId'],
      points: g._sum.points ?? 0,
      rounds: g._count._all,
    }));
    return { total: kind.GAME + kind.BONUS, byKind: kind, byGame: games };
  }

  /** GET /me/points */
  async myPoints(user: AuthUser, query: RankingQuery): Promise<MyPointsResponse> {
    const range = this.time.resolveRange(query);
    const totals = await this.totals(user.id, range);
    const current = await this.ranking.currentRank(user.id);
    let cls: MyPointsResponse['class'] = null;
    if (current) {
      const name = await this.repo.className(current.classId);
      cls = { id: current.classId, name: name ?? '', rank: current.rank, members: current.members };
    }
    const byGame = query.gameId ? totals.byGame.filter((g) => g.gameId === query.gameId) : totals.byGame;
    return { ...totals, byGame, class: cls, range: { range: query.range, from: query.from, to: query.to } };
  }

  /** GET /me/class/ranking */
  async myClassRanking(user: AuthUser, query: RankingQuery): Promise<RankingResponse> {
    const classId = await this.repo.currentClassId(user.id);
    if (!classId) throw new AppError('NOT_FOUND', 404, { message: 'Bạn chưa thuộc lớp nào' });
    return this.classRanking(classId, query, user.id);
  }

  async classRanking(classId: string, query: RankingQuery, meId?: string): Promise<RankingResponse> {
    const className = await this.repo.className(classId);
    if (className === null) throw notFound('Không tìm thấy lớp');
    const items = await this.ranking.rankingEntries(
      classId,
      { range: this.time.resolveRange(query), gameId: query.gameId ?? null },
      meId,
    );
    return {
      classId,
      className,
      gameId: query.gameId ?? null,
      range: { range: query.range, from: query.from, to: query.to },
      items,
      me: items.find((i) => i.isMe) ?? null,
    };
  }

  /** Sổ điểm (lọc theo lớp / học sinh / loại / game / thời gian) — caller đã kiểm tra scope */
  async list(query: PointsListQuery): Promise<Paginated<PointEntryView>> {
    const range = this.time.resolveRange(query);
    const where: Prisma.PointEntryWhereInput = {
      studentId: query.studentId,
      classId: query.classId,
      kind: query.kind,
      gameId: query.gameId,
      createdAt: range ? { gte: range.from, lt: range.to } : undefined,
    };
    return paginate(
      query,
      async (args) => (await this.repo.findPage(where, args)).map(toEntryView),
      () => this.repo.count(where),
    );
  }
}
