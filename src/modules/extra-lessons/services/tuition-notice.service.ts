import { Injectable } from '@nestjs/common';
import { type TuitionNoticeQuery, type TuitionNoticesResponse } from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { TuitionRepository } from '@/modules/extra-lessons/repositories/tuition.repository';
import { groupNotices } from '@/modules/extra-lessons/utils/tuition-notice';
import { statementDueDate } from '@/modules/extra-lessons/utils/tuition-statement';
import { monthsDateRange } from '@/modules/extra-lessons/utils/tuition';
import { TuitionSettingsService } from '@/modules/settings/services/tuition-settings.service';

/**
 * Dữ liệu soạn tin nhắn thông báo học phí một tháng (ADMIN): mỗi phụ huynh nhận học phí một dòng, tiền học thêm tạm
 * tính từ điểm danh như phiếu PDF. Có `classId` → mọi bé đang học lớp đó (kể cả không học thêm — admin nhập số tiền
 * chung ở admin); không có → các bé có điểm danh học thêm trong tháng. Tin nhắn soạn ở admin (`renderTuitionNotice`)
 * để sửa số tiền / mẫu thấy ngay.
 */
@Injectable()
export class TuitionNoticeService {
  constructor(
    private readonly repo: TuitionRepository,
    private readonly settings: TuitionSettingsService,
  ) {}

  async list(query: TuitionNoticeQuery): Promise<TuitionNoticesResponse> {
    const range = monthsDateRange(query.month, query.month);
    const settings = await this.settings.get();
    let students;
    let totals;
    if (query.classId) {
      if (!(await this.repo.classExists(query.classId))) throw notFound('classNotFound');
      students = await this.repo.noticeStudents({ classId: query.classId });
      totals = students.length
        ? await this.repo.noticeTotals(
            range,
            students.map((s) => s.id),
          )
        : [];
    } else {
      totals = await this.repo.noticeTotals(range);
      students = totals.length
        ? await this.repo.noticeStudents({ studentIds: totals.map((t) => t.studentId) })
        : [];
    }
    return {
      month: query.month,
      classId: query.classId ?? null,
      dueDate: statementDueDate(query.month, settings.dueDay),
      items: groupNotices(students, totals, {
        month: query.month,
        transferTemplate: settings.transferContent,
      }),
    };
  }
}
