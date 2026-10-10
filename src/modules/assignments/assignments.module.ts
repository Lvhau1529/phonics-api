import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { WorksheetsModule } from '../worksheets/worksheets.module';
import { AssignmentsMeController } from './controllers/assignments-me.controller';
import { AssignmentsController } from './controllers/assignments.controller';
import { AssignmentsScheduler } from './jobs/assignments.scheduler';
import { AssignmentRepository } from './repositories/assignment.repository';
import { AssignmentLifecycleService } from './services/assignment-lifecycle.service';
import { AssignmentRankingService } from './services/assignment-ranking.service';
import { AssignmentReaderService } from './services/assignment-reader.service';
import { AssignmentStudentService } from './services/assignment-student.service';
import { AssignmentWriterService } from './services/assignment-writer.service';

/** Giao phiếu cho lớp: snapshot, cửa sổ thời gian, roster, xếp hạng theo bài — ADR 0017 / 0019 */
@Module({
  imports: [AuditModule, MediaModule, WorksheetsModule],
  controllers: [AssignmentsController, AssignmentsMeController],
  providers: [
    AssignmentRepository,
    AssignmentReaderService,
    AssignmentWriterService,
    AssignmentStudentService,
    AssignmentLifecycleService,
    AssignmentRankingService,
    AssignmentsScheduler,
  ],
  exports: [AssignmentReaderService, AssignmentStudentService, AssignmentRankingService],
})
export class AssignmentsModule {}
