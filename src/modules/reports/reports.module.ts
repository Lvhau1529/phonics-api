import { Module } from '@nestjs/common';
import { PointsModule } from '../points/points.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './v1/reports.controller';

/** Xuất báo cáo xlsx / pdf (xếp hạng, sổ điểm) — dùng lại RankingService của PointsModule */
@Module({
  imports: [PointsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
