import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { AttendancePublicController } from '@/modules/extra-lessons/controllers/attendance-public.controller';
import { AttendanceController } from '@/modules/extra-lessons/controllers/attendance.controller';
import { ExtraRatesController } from '@/modules/extra-lessons/controllers/extra-rates.controller';
import { ExtraSlotsController } from '@/modules/extra-lessons/controllers/extra-slots.controller';
import { StudentExtraController } from '@/modules/extra-lessons/controllers/student-extra.controller';
import { TuitionController } from '@/modules/extra-lessons/controllers/tuition.controller';
import { ExtraLessonsScheduler } from '@/modules/extra-lessons/jobs/extra-lessons.scheduler';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { TuitionRepository } from '@/modules/extra-lessons/repositories/tuition.repository';
import { AttendanceDigestService } from '@/modules/extra-lessons/services/attendance-digest.service';
import { AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { AttendanceWriterService } from '@/modules/extra-lessons/services/attendance-writer.service';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraEnrollmentService } from '@/modules/extra-lessons/services/extra-enrollment.service';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { ExtraSlotWriterService } from '@/modules/extra-lessons/services/extra-slot-writer.service';
import { SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';
import { SlotAssignmentService } from '@/modules/extra-lessons/services/slot-assignment.service';
import { StudentExtraReaderService } from '@/modules/extra-lessons/services/student-extra-reader.service';
import { TuitionStatementService } from '@/modules/extra-lessons/services/tuition-statement.service';
import { TuitionService } from '@/modules/extra-lessons/services/tuition.service';
import { MailModule } from '@/modules/mail/mail.module';
import { SettingsModule } from '@/modules/settings/settings.module';

/**
 * Học thêm (docs/attendance-design.md §4–§6): ca định kỳ, lịch từng học sinh, đơn giá có lịch sử, buổi + điểm danh
 * (scheduler 00:05 tạo buổi / 21:00 mail GV, trang duyệt nhanh theo token), học phí tạm tính + phiếu báo học phí PDF.
 */
@Module({
  imports: [AuditModule, MailModule, SettingsModule],
  controllers: [
    ExtraSlotsController,
    StudentExtraController,
    ExtraRatesController,
    AttendanceController,
    AttendancePublicController,
    TuitionController,
  ],
  providers: [
    ExtraSlotRepository,
    ExtraScheduleRepository,
    ExtraAccessService,
    ExtraSlotReaderService,
    ExtraSlotWriterService,
    SlotAssignmentService,
    ExtraRateService,
    StudentExtraReaderService,
    AttendanceRepository,
    SessionSyncService,
    AttendanceReaderService,
    AttendanceWriterService,
    AttendanceDigestService,
    ExtraLessonsScheduler,
    ExtraEnrollmentService,
    TuitionRepository,
    TuitionService,
    TuitionStatementService,
  ],
  exports: [ExtraEnrollmentService],
})
export class ExtraLessonsModule {}
