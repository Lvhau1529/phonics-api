import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { SubmissionsMeController } from './controllers/submissions-me.controller';
import { SubmissionsController } from './controllers/submissions.controller';
import { SubmissionRepository } from './repositories/submission.repository';
import { SubmissionGradingService } from './services/submission-grading.service';
import { SubmissionReaderService } from './services/submission-reader.service';
import { SubmissionStudentService } from './services/submission-student.service';

/** Bài nộp: học sinh làm / nộp, giáo viên chấm — ADR 0019 */
@Module({
  imports: [AuditModule, MediaModule, AssignmentsModule],
  controllers: [SubmissionsController, SubmissionsMeController],
  providers: [
    SubmissionRepository,
    SubmissionReaderService,
    SubmissionStudentService,
    SubmissionGradingService,
  ],
  exports: [SubmissionReaderService],
})
export class SubmissionsModule {}
