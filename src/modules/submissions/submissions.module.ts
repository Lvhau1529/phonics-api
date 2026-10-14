import { Module } from '@nestjs/common';
import { AssignmentsModule } from '@/modules/assignments/assignments.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { MediaModule } from '@/modules/media/media.module';
import { SubmissionsMeController } from '@/modules/submissions/controllers/submissions-me.controller';
import { SubmissionsController } from '@/modules/submissions/controllers/submissions.controller';
import { SubmissionRepository } from '@/modules/submissions/repositories/submission.repository';
import { SubmissionGradingService } from '@/modules/submissions/services/submission-grading.service';
import { SubmissionReaderService } from '@/modules/submissions/services/submission-reader.service';
import { SubmissionStudentService } from '@/modules/submissions/services/submission-student.service';

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
