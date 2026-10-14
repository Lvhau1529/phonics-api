import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { MediaModule } from '@/modules/media/media.module';
import { WorksheetsModule } from '@/modules/worksheets/worksheets.module';
import { AssignmentsMeController } from '@/modules/assignments/controllers/assignments-me.controller';
import { AssignmentsController } from '@/modules/assignments/controllers/assignments.controller';
import { AssignmentsScheduler } from '@/modules/assignments/jobs/assignments.scheduler';
import { AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';
import { AssignmentLifecycleService } from '@/modules/assignments/services/assignment-lifecycle.service';
import { AssignmentRankingService } from '@/modules/assignments/services/assignment-ranking.service';
import { AssignmentReaderService } from '@/modules/assignments/services/assignment-reader.service';
import { AssignmentStudentService } from '@/modules/assignments/services/assignment-student.service';
import { AssignmentWriterService } from '@/modules/assignments/services/assignment-writer.service';

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
