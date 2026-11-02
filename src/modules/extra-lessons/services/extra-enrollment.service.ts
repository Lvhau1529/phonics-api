import { Injectable } from '@nestjs/common';
import { type AffectedSession } from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { type Tx } from '@/database/types';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';

export interface NewEnrollment {
  slotId: string;
  effectiveFrom: string;
  /** Đơn giá riêng học sinh (áp mọi ca) từ `effectiveFrom`; trống = giá mặc định của ca */
  pricePerSession?: number;
}

/**
 * Xếp học sinh **vừa tạo** vào ca + đặt giá riêng ngay trong transaction tạo học sinh (students `POST /students`).
 * Học sinh mới chưa có lịch / giá nên không cần kiểm tra chồng lịch hay đóng giá cũ như `SlotAssignmentService` /
 * `ExtraRateService`. GV: chỉ ca mình dạy; đặt giá cần thêm extra.managePricing.
 */
@Injectable()
export class ExtraEnrollmentService {
  constructor(
    private readonly repo: ExtraScheduleRepository,
    private readonly slots: ExtraSlotReaderService,
    private readonly access: ExtraAccessService,
    private readonly sync: SessionSyncService,
  ) {}

  today(): string {
    return this.slots.today();
  }

  /** Ca tồn tại, chưa lưu trữ, người thao tác dạy ca đó; có giá → cần quyền đặt giá */
  async assertCanEnroll(actor: AuthUser, slotId: string, withPrice: boolean): Promise<void> {
    const slot = await this.slots.find(slotId);
    if (slot.archivedAt) throw new AppError('CONFLICT', 409, { message: 'extraSlotArchived' });
    await this.access.assertSlotAccess(actor, slotId);
    if (withPrice && !(await this.access.has(actor, 'extra.managePricing'))) {
      throw new AppError('FORBIDDEN_PERMISSION', 403, { details: { permission: ['extra.managePricing'] } });
    }
  }

  async enroll(tx: Tx, actor: AuthUser, studentId: string, input: NewEnrollment): Promise<void> {
    await this.repo.createAssignment(tx, {
      studentId,
      slotId: input.slotId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      note: null,
      createdById: actor.id,
    });
    if (input.pricePerSession === undefined) return;
    await this.repo.createRate(tx, {
      studentId,
      slotId: null,
      pricePerSession: input.pricePerSession,
      effectiveFrom: input.effectiveFrom,
      note: null,
      createdById: actor.id,
    });
  }

  /** Sau commit: thêm học sinh vào buổi PENDING đã tạo; trả buổi CONFIRMED (ngày quá khứ) đang thiếu học sinh */
  syncAfterEnroll(studentId: string, input: NewEnrollment): Promise<AffectedSession[]> {
    return this.sync.syncStudent(studentId, [input.slotId], input.effectiveFrom, null);
  }
}
