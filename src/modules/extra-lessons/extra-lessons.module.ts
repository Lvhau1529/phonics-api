import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ExtraSlotsController } from '@/modules/extra-lessons/controllers/extra-slots.controller';
import { StudentExtraController } from '@/modules/extra-lessons/controllers/student-extra.controller';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { ExtraSlotWriterService } from '@/modules/extra-lessons/services/extra-slot-writer.service';
import { SlotAssignmentService } from '@/modules/extra-lessons/services/slot-assignment.service';
import { StudentExtraReaderService } from '@/modules/extra-lessons/services/student-extra-reader.service';

/**
 * Học thêm (docs/attendance-design.md §4, §6): ca định kỳ, lịch từng học sinh, đơn giá có lịch sử. Buổi + điểm danh
 * (scheduler 00:05 / 21:00) thêm ở bước sau.
 */
@Module({
  imports: [AuditModule],
  controllers: [ExtraSlotsController, StudentExtraController],
  providers: [
    ExtraSlotRepository,
    ExtraScheduleRepository,
    ExtraAccessService,
    ExtraSlotReaderService,
    ExtraSlotWriterService,
    SlotAssignmentService,
    ExtraRateService,
    StudentExtraReaderService,
  ],
})
export class ExtraLessonsModule {}
