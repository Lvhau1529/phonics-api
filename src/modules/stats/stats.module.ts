import { Module } from '@nestjs/common';
import { PointsModule } from '@/modules/points/points.module';
import { StatsController } from '@/modules/stats/controllers/stats.controller';
import { StatsRepository } from '@/modules/stats/repositories/stats.repository';
import { ClassStatsService } from '@/modules/stats/services/class-stats.service';
import { GameStatsService } from '@/modules/stats/services/game-stats.service';
import { OverviewStatsService } from '@/modules/stats/services/overview-stats.service';

/** Thống kê cho admin / giáo viên (dùng lại SQL xếp hạng của PointsModule) */
@Module({
  imports: [PointsModule],
  controllers: [StatsController],
  providers: [StatsRepository, OverviewStatsService, ClassStatsService, GameStatsService],
})
export class StatsModule {}
