import { Module } from '@nestjs/common';
import { PointsModule } from '../points/points.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Xuất báo cáo xlsx / pdf (xếp hạng, sổ điểm) — dùng lại RankingService của PointsModule */
@Module({
  imports: [PointsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
