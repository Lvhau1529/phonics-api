import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { PointsModule } from '../points/points.module';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';

/** Xuất báo cáo xlsx / pdf (xếp hạng, sổ điểm) — dùng lại RankingService của PointsModule */
@Module({
  imports: [PointsModule, AssignmentsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
