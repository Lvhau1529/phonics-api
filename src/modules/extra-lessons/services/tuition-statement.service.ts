import { Injectable } from '@nestjs/common';
import { REPORT_MIME, type TuitionStatementQuery } from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { TimeService } from '@/core/time/time.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { TuitionRepository } from '@/modules/extra-lessons/repositories/tuition.repository';
import { ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { buildStatement } from '@/modules/extra-lessons/utils/tuition-statement';
import { monthsDateRange } from '@/modules/extra-lessons/utils/tuition';
import { buildTuitionStatementPdf } from '@/modules/extra-lessons/writers/tuition-statement.writer';
import { type ReportFile } from '@/modules/reports/types/report.types';
import { slugify } from '@/modules/reports/utils/report-format';
import { TuitionSettingsService } from '@/modules/settings/services/tuition-settings.service';

/**
 * Phiếu báo học phí một tháng cho phụ huynh (PDF, tạm tính từ điểm danh như tab Học phí): từ một bé → phụ huynh nhận
 * học phí → mọi bé người đó nhận học phí. GV chỉ thấy các bé trong phạm vi của mình (bé được chọn phải trong phạm vi).
 */
@Injectable()
export class TuitionStatementService {
  constructor(
    private readonly repo: TuitionRepository,
    private readonly access: ExtraAccessService,
    private readonly settings: TuitionSettingsService,
    private readonly time: TimeService,
  ) {}

  async pdf(user: AuthUser, studentId: string, { month }: TuitionStatementQuery): Promise<ReportFile> {
    await this.access.assertStudentAccess(user, studentId);
    const student = await this.repo.statementStudent(studentId);
    if (!student) throw notFound('studentNotFound');

    const guardian = await this.repo.billingGuardian(studentId);
    const family = guardian ? await this.repo.billedStudents(guardian.id) : [];
    const candidates = family.some((s) => s.id === studentId) ? family : [student, ...family];
    const allowed = await Promise.all(
      candidates.map((s) => s.id === studentId || this.access.canAccessStudent(user, s.id)),
    );
    const students = candidates.filter((_, i) => allowed[i]);

    const [records, { updatedAt: _u, ...settings }] = await Promise.all([
      this.repo.statementRecords(
        students.map((s) => s.id),
        monthsDateRange(month, month),
      ),
      this.settings.get(),
    ]);
    const statement = buildStatement({
      month,
      recipient: guardian,
      students,
      records,
      settings,
      generatedAt: this.time.format(new Date(), 'DD/MM/YYYY HH:mm'),
    });
    return {
      buffer: await buildTuitionStatementPdf(statement),
      filename: `hoc-phi-${month}-${slugify(guardian?.fullName ?? student.vietnameseName)}.pdf`,
      mime: REPORT_MIME.pdf,
    };
  }
}
