import { Module } from '@nestjs/common';
import { PointsModule } from '../points/points.module';
import { StatsController } from './controllers/stats.controller';
import { StatsRepository } from './repositories/stats.repository';
import { ClassStatsService } from './services/class-stats.service';
import { GameStatsService } from './services/game-stats.service';
import { OverviewStatsService } from './services/overview-stats.service';

/** Thống kê cho admin / giáo viên (dùng lại SQL xếp hạng của PointsModule) */
@Module({
  imports: [PointsModule],
  controllers: [StatsController],
  providers: [StatsRepository, OverviewStatsService, ClassStatsService, GameStatsService],
})
export class StatsModule {}
