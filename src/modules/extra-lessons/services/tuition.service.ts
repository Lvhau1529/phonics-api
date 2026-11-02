import { Injectable } from '@nestjs/common';
import { type StudentTuitionResponse, type TuitionOverview, type TuitionQuery } from '@phonics/contracts';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { TuitionRepository } from '@/modules/extra-lessons/repositories/tuition.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { fillMonths, monthsDateRange, sumMonths } from '@/modules/extra-lessons/utils/tuition';

const TOP_STUDENTS = 10;

/**
 * Thống kê học phí tạm tính từ điểm danh (đơn giá chốt trên từng bản ghi, không gồm buổi huỷ) — trước khi có phiếu
 * học phí tháng (§7). Tổng quát: ADMIN (controller); theo học sinh: quyền xem giá + phạm vi học sinh.
 */
@Injectable()
export class TuitionService {
  constructor(
    private readonly repo: TuitionRepository,
    private readonly access: ExtraAccessService,
  ) {}

  async overview(query: TuitionQuery): Promise<TuitionOverview> {
    const scope = monthsDateRange(query.from, query.to);
    const [months, bySlot, topStudents, warnings, [all]] = await Promise.all([
      this.repo.byMonth(scope),
      this.repo.bySlot(scope),
      this.repo.topStudents(scope, TOP_STUDENTS),
      this.repo.warnings(scope),
      this.repo.total(scope),
    ]);
    const filled = fillMonths(query.from, query.to, months);
    return {
      ...query,
      months: filled,
      totals: sumMonths(filled, all?.studentCount ?? 0),
      bySlot,
      topStudents: topStudents.map(({ studentCount: _s, ...rest }) => rest),
      ...warnings,
    };
  }

  async student(user: AuthUser, studentId: string, query: TuitionQuery): Promise<StudentTuitionResponse> {
    await this.access.assertStudentAccess(user, studentId);
    const months = fillMonths(
      query.from,
      query.to,
      await this.repo.byMonth({ ...monthsDateRange(query.from, query.to), studentId }),
    );
    return { ...query, months, totals: sumMonths(months, months.some((m) => m.studentCount) ? 1 : 0) };
  }
}
