import { Injectable } from '@nestjs/common';
import {
  GAME_IDS,
  type ClassGameStats,
  type DistributionBucket,
  type PointsTimelineBucket,
  type RangeQuery,
  type RankingQuery,
  type TimelineQuery,
  type TopStudent,
} from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { TimeService } from '@/core/time/time.service';
import { PrismaService } from '@/database/prisma.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { RankingService } from '@/modules/points/services/ranking.service';
import { StatsRepository } from '@/modules/stats/repositories/stats.repository';
import { type TopStudentsQuery } from '@/modules/stats/types/stats.schemas';
import { distribute } from '@/modules/stats/utils/distribution';

/** Thống kê theo lớp: điểm theo thời gian, top học sinh, phân bố điểm, từng game */
@Injectable()
export class ClassStatsService {
  constructor(
    private readonly repo: StatsRepository,
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
    private readonly access: AccessService,
    private readonly ranking: RankingService,
  ) {}

  /** GET /stats/classes/:id/points-timeline */
  async pointsTimeline(
    user: AuthUser,
    classId: string,
    query: TimelineQuery,
  ): Promise<PointsTimelineBucket[]> {
    await this.assertClass(user, classId);
    const rows = await this.repo.pointsTimeline(classId, this.time.resolveRange(query), {
      bucket: query.bucket,
      timeZone: this.time.timeZone,
      kind: query.kind,
      gameId: query.gameId,
    });
    return rows.map((r) => ({
      bucketStart: r.bucketStart,
      GAME: r.GAME,
      BONUS: r.BONUS,
      total: r.GAME + r.BONUS,
    }));
  }

  /** GET /stats/classes/:id/top-students */
  async topStudents(user: AuthUser, classId: string, query: TopStudentsQuery): Promise<TopStudent[]> {
    await this.assertClass(user, classId);
    const entries = await this.ranking.rankingEntries(classId, {
      range: this.time.resolveRange(query),
      gameId: query.gameId ?? null,
    });
    return entries.slice(0, query.limit).map(({ rank, studentId, displayName, avatarKey, points }) => ({
      rank,
      studentId,
      displayName,
      avatarKey,
      points,
    }));
  }

  /** GET /stats/classes/:id/distribution — số học sinh theo khoảng điểm [from, to) */
  async distribution(user: AuthUser, classId: string, query: RankingQuery): Promise<DistributionBucket[]> {
    await this.assertClass(user, classId);
    const rows = await this.ranking.rankClass(this.prisma, classId, {
      range: this.time.resolveRange(query),
      gameId: query.gameId ?? null,
    });
    return distribute(rows.map((r) => r.points));
  }

  /** GET /stats/classes/:id/games — mỗi game trong catalog một dòng (0 nếu chưa chơi) */
  async games(user: AuthUser, classId: string, query: RangeQuery): Promise<ClassGameStats[]> {
    await this.assertClass(user, classId);
    const { results, points } = await this.repo.classGameAggregates(classId, this.time.resolveRange(query));
    const byGame = new Map(results.map((r) => [r.gameId, r]));
    const pointsByGame = new Map(points.map((p) => [p.gameId, p.points]));
    return GAME_IDS.map((gameId) => {
      const r = byGame.get(gameId);
      return {
        gameId,
        rounds: r?.rounds ?? 0,
        players: r?.players ?? 0,
        accuracy: r && r.total > 0 ? r.correct / r.total : 0,
        points: pointsByGame.get(gameId) ?? 0,
      };
    });
  }

  private async assertClass(user: AuthUser, classId: string): Promise<void> {
    await this.access.assertClassAccess(user, classId);
    if (!(await this.repo.classExists(classId))) throw notFound('Không tìm thấy lớp');
  }
}
