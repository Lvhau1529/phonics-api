import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type TimeService } from '@/core/time/time.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type TuitionRepository } from '@/modules/extra-lessons/repositories/tuition.repository';
import { type ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { TuitionStatementService } from '@/modules/extra-lessons/services/tuition-statement.service';
import {
  EMPTY_TUITION_SETTINGS,
  type TuitionSettingsService,
} from '@/modules/settings/services/tuition-settings.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const khang = { id: 's1', vietnameseName: 'Trần Minh Khang', englishName: null };
const ruby = { id: 's2', vietnameseName: 'Trần Bảo Ngọc', englishName: 'Ruby' };

function setup() {
  const repo = mockDeep<TuitionRepository>();
  const access = mockDeep<ExtraAccessService>();
  const settings = mockDeep<TuitionSettingsService>();
  const time = mockDeep<TimeService>();
  const service = new TuitionStatementService(repo, access, settings, time);
  repo.statementStudent.mockResolvedValue(khang);
  repo.statementRecords.mockResolvedValue([]);
  settings.get.mockResolvedValue({ ...EMPTY_TUITION_SETTINGS, updatedAt: null });
  time.format.mockReturnValue('03/11/2026 08:00');
  return { repo, access, service };
}

describe('TuitionStatementService.pdf', () => {
  it('gộp các bé cùng phụ huynh nhận học phí; GV chỉ thấy bé trong phạm vi', async () => {
    const { repo, access, service } = setup();
    repo.billingGuardian.mockResolvedValue({ id: 'g1', fullName: 'Nguyễn Thị Mai', phone: null });
    repo.billedStudents.mockResolvedValue([
      ruby,
      khang,
      { id: 's3', vietnameseName: 'Bé Khác', englishName: null },
    ]);
    access.canAccessStudent.mockImplementation(async (_u, id) => id === 's2');

    const file = await service.pdf(teacher, 's1', { month: '2026-10' });

    expect(access.assertStudentAccess).toHaveBeenCalledWith(teacher, 's1');
    expect(repo.statementRecords).toHaveBeenCalledWith(['s2', 's1'], {
      from: '2026-10-01',
      to: '2026-11-01',
    });
    expect(file.filename).toBe('hoc-phi-2026-10-nguyen-thi-mai.pdf');
    expect(file.mime).toBe('application/pdf');
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('bé chưa có phụ huynh nhận học phí → phiếu chỉ có bé đó', async () => {
    const { repo, service } = setup();
    repo.billingGuardian.mockResolvedValue(null);
    const file = await service.pdf(teacher, 's1', { month: '2026-10' });
    expect(repo.billedStudents).not.toHaveBeenCalled();
    expect(repo.statementRecords).toHaveBeenCalledWith(['s1'], expect.anything());
    expect(file.filename).toBe('hoc-phi-2026-10-tran-minh-khang.pdf');
  });

  it('học sinh không tồn tại / đã xoá → 404', async () => {
    const { repo, service } = setup();
    repo.statementStudent.mockResolvedValue(null);
    await expect(service.pdf(teacher, 's9', { month: '2026-10' })).rejects.toBeInstanceOf(AppError);
  });
});
