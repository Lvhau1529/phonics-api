import { Module } from '@nestjs/common';
import { PointsModule } from '../points/points.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/** Thống kê cho admin / giáo viên (dùng lại SQL xếp hạng của PointsModule) */
@Module({
  imports: [PointsModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
