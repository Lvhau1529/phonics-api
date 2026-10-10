import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AssignmentStatsController } from './controllers/assignment-stats.controller';
import { WorksheetStatsMeController } from './controllers/worksheet-stats-me.controller';
import { WorksheetStatsController } from './controllers/worksheet-stats.controller';
import { WorksheetStatsRepository } from './repositories/worksheet-stats.repository';
import { AssignmentStatsService } from './services/assignment-stats.service';
import { ClassWorksheetStatsService } from './services/class-worksheet-stats.service';
import { StudentWorksheetStatsService } from './services/student-worksheet-stats.service';

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
