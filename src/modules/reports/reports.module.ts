import { Module } from '@nestjs/common';
import { AssignmentsModule } from '@/modules/assignments/assignments.module';
import { PointsModule } from '@/modules/points/points.module';
import { ReportsService } from '@/modules/reports/services/reports.service';
import { ReportsController } from '@/modules/reports/controllers/reports.controller';

/** Xuất báo cáo xlsx / pdf (xếp hạng, sổ điểm) — dùng lại RankingService của PointsModule */
@Module({
  imports: [PointsModule, AssignmentsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
