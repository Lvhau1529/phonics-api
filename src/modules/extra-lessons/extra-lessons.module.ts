import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { AttendancePublicController } from '@/modules/extra-lessons/controllers/attendance-public.controller';
import { AttendanceController } from '@/modules/extra-lessons/controllers/attendance.controller';
import { ExtraRatesController } from '@/modules/extra-lessons/controllers/extra-rates.controller';
import { ExtraSlotsController } from '@/modules/extra-lessons/controllers/extra-slots.controller';
import { StudentExtraController } from '@/modules/extra-lessons/controllers/student-extra.controller';
import { ExtraLessonsScheduler } from '@/modules/extra-lessons/jobs/extra-lessons.scheduler';
import { AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
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
import { MailModule } from '@/modules/mail/mail.module';

/**
 * Học thêm (docs/attendance-design.md §4–§6): ca định kỳ, lịch từng học sinh, đơn giá có lịch sử, buổi + điểm danh
 * (scheduler 00:05 tạo buổi / 21:00 mail GV, trang duyệt nhanh theo token).
 */
@Module({
  imports: [AuditModule, MailModule],
  controllers: [
    ExtraSlotsController,
    StudentExtraController,
    ExtraRatesController,
    AttendanceController,
    AttendancePublicController,
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
  ],
  exports: [ExtraEnrollmentService],
})
export class ExtraLessonsModule {}
