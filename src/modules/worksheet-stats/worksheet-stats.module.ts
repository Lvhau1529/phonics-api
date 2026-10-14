import { Module } from '@nestjs/common';
import { AssignmentsModule } from '@/modules/assignments/assignments.module';
import { AssignmentStatsController } from '@/modules/worksheet-stats/controllers/assignment-stats.controller';
import { WorksheetStatsMeController } from '@/modules/worksheet-stats/controllers/worksheet-stats-me.controller';
import { WorksheetStatsController } from '@/modules/worksheet-stats/controllers/worksheet-stats.controller';
import { WorksheetStatsRepository } from '@/modules/worksheet-stats/repositories/worksheet-stats.repository';
import { AssignmentStatsService } from '@/modules/worksheet-stats/services/assignment-stats.service';
import { ClassWorksheetStatsService } from '@/modules/worksheet-stats/services/class-worksheet-stats.service';
import { StudentWorksheetStatsService } from '@/modules/worksheet-stats/services/student-worksheet-stats.service';

/** Thống kê phiếu bài tập theo lớp / học sinh / bài giao */
@Module({
  imports: [AssignmentsModule],
  controllers: [WorksheetStatsController, AssignmentStatsController, WorksheetStatsMeController],
  providers: [
    WorksheetStatsRepository,
    AssignmentStatsService,
    ClassWorksheetStatsService,
    StudentWorksheetStatsService,
  ],
})
export class WorksheetStatsModule {}
