import { Injectable } from '@nestjs/common';
import { type StudentExtraResponse } from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toExtraRate, toSlotAssignment } from '@/modules/extra-lessons/dto/responses/extra.view';
import { ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { resolveRate } from '@/modules/extra-lessons/utils/rate';
import { isActiveOn } from '@/modules/extra-lessons/utils/schedule';

/** Tab "Học thêm" của học sinh: lịch (cả lịch sử), giá riêng, đơn giá áp dụng hôm nay, cờ quyền sửa */
@Injectable()
export class StudentExtraReaderService {
  constructor(
    private readonly repo: ExtraScheduleRepository,
    private readonly slots: ExtraSlotReaderService,
    private readonly access: ExtraAccessService,
  ) {}

  async detail(user: AuthUser, studentId: string): Promise<StudentExtraResponse> {
    if (!(await this.repo.findStudent(studentId))) throw notFound('studentNotFound');
    await this.access.assertStudentAccess(user, studentId);
    const today = this.slots.today();
    const [assignments, canView, canSchedule, canPrice] = await Promise.all([
      this.repo.assignmentsOf(studentId),
      this.access.has(user, 'extra.viewPricing'),
      this.access.has(user, 'extra.manageSchedule'),
      this.access.has(user, 'extra.managePricing'),
    ]);
    const openSlotIds = [
      ...new Set(
        assignments
          .filter((a) => isActiveOn({ from: a.effectiveFrom, to: a.effectiveTo }, today))
          .map((a) => a.slotId),
      ),
    ];
    const [rates, studentRates] = canView
      ? await Promise.all([this.repo.ratesFor([studentId], openSlotIds), this.repo.studentRates(studentId)])
      : [null, null];
    return {
      assignments: assignments.map(toSlotAssignment),
      rates: studentRates && studentRates.map(toExtraRate),
      appliedRates:
        rates &&
        openSlotIds.map((slotId) => ({ slotId, rate: resolveRate(rates, studentId, slotId, today) })),
      // Đã qua assertStudentAccess; GV còn cần dạy ca để thêm / sửa (kiểm tra lại khi ghi)
      canManageSchedule: canSchedule,
      canManagePricing: canPrice && (await this.access.canSetStudentRate(user, studentId, today)),
    };
  }
}
