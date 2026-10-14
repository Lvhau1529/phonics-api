import { Injectable } from '@nestjs/common';
import { type GameByClassStats, type GameTimelineBucket, type RangeQuery } from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { AccessService } from '@/core/access/access.service';
import { TimeService } from '@/core/time/time.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { StatsRepository } from '@/modules/stats/repositories/stats.repository';
import { type GameTimelineQuery } from '@/modules/stats/types/stats.schemas';

/** Thống kê theo game: lượt xem / chơi theo thời gian, theo lớp */
@Injectable()
export class GameStatsService {
  constructor(
    private readonly repo: StatsRepository,
    private readonly time: TimeService,
    private readonly access: AccessService,
  ) {}

  /** GET /stats/games/:id/timeline */
  async timeline(gameId: string, query: GameTimelineQuery): Promise<GameTimelineBucket[]> {
    await this.assertGame(gameId);
    return this.repo.gameTimeline(gameId, this.time.resolveRange(query), {
      bucket: query.bucket,
      timeZone: this.time.timeZone,
    });
  }

  /** GET /stats/games/:id/by-class — TEACHER chỉ thấy lớp mình dạy */
  async byClass(user: AuthUser, gameId: string, query: RangeQuery): Promise<GameByClassStats[]> {
    await this.assertGame(gameId);
    const classIds = await this.access.scopedClassIds(user);
    if (classIds && !classIds.length) return [];
    return this.repo.gameByClass(gameId, this.time.resolveRange(query), classIds);
  }

  private async assertGame(gameId: string): Promise<void> {
    if (!(await this.repo.gameExists(gameId))) throw notFound('Không tìm thấy game');
  }
}
