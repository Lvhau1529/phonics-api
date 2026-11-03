import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { type ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { ExtraRateService } from '@/modules/extra-lessons/services/extra-rate.service';
import { type ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { type SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const rate = {
  id: 'r1',
  studentId: null,
  slotId: 'slot1',
  pricePerSession: 120_000,
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  note: null,
};
const updated = {
  ...rate,
  pricePerSession: 150_000,
  createdById: 't1',
  createdBy: { id: 't1', displayName: 'Cô Hoa' },
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

function setup() {
  const repo = mockDeep<ExtraScheduleRepository>();
  const access = mockDeep<ExtraAccessService>();
  const audit = mockDeep<AuditService>();
  const sync = mockDeep<SessionSyncService>();
  const service = new ExtraRateService(repo, mockDeep<ExtraSlotReaderService>(), access, audit, sync);
  repo.transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn({})) as never);
  repo.findRate.mockResolvedValue(rate as never);
  repo.updateRate.mockResolvedValue(updated as never);
  sync.repriceForRate.mockResolvedValue([]);
  return { repo, access, audit, sync, service };
}

describe('ExtraRateService.update', () => {
  it('sửa giá trong khoá phạm vi, ghi audit trước / sau, tính lại buổi và trả bản ghi đã xác nhận lệch', async () => {
    const { repo, audit, sync, service } = setup();
    const affected = [
      {
        sessionId: 'x1',
        studentId: 's1',
        date: '2026-10-06',
        oldPrice: 120_000,
        newPrice: 150_000,
        charged: true,
      },
    ];
    sync.repriceForRate.mockResolvedValue(affected);

    const res = await service.update(teacher, 'r1', { pricePerSession: 150_000 });

    expect(repo.lockScope).toHaveBeenCalledWith({}, null, 'slot1');
    expect(repo.updateRate).toHaveBeenCalledWith({}, 'r1', { pricePerSession: 150_000 });
    expect(audit.record).toHaveBeenCalledWith(
      teacher,
      'extraRate.update',
      'ExtraRate',
      'r1',
      { pricePerSession: 120_000, note: null, effectiveTo: null },
      { pricePerSession: 150_000 },
    );
    expect(sync.repriceForRate).toHaveBeenCalledWith(updated);
    expect(res).toMatchObject({ id: 'r1', pricePerSession: 150_000, affectedRecords: affected });
  });

  it('dòng đã bị thay thế từ đầu → 409, không sửa', async () => {
    const { repo, service } = setup();
    repo.findRate.mockResolvedValue({ ...rate, effectiveTo: rate.effectiveFrom } as never);

    const err = await service.update(teacher, 'r1', { pricePerSession: 1 }).catch((e: unknown) => e);

    expect((err as AppError).code).toBe('CONFLICT');
    expect(repo.updateRate).not.toHaveBeenCalled();
  });

  it('GV không dạy ca của giá → FORBIDDEN_SCOPE', async () => {
    const { repo, access, service } = setup();
    access.assertSlotAccess.mockRejectedValue(new AppError('FORBIDDEN_SCOPE', 403));

    await expect(service.update(teacher, 'r1', { pricePerSession: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    expect(repo.updateRate).not.toHaveBeenCalled();
  });

  it('kết thúc ưu đãi của học sinh: ghi effectiveTo rồi tính lại buổi', async () => {
    const { repo, sync, service } = setup();
    const own = { ...rate, studentId: 's1' };
    repo.findRate.mockResolvedValue(own as never);
    repo.lockScope.mockResolvedValue([{ id: 'r1', effectiveFrom: '2026-10-01', effectiveTo: null }]);

    await service.update(teacher, 'r1', { effectiveTo: '2026-11-03' });

    expect(repo.updateRate).toHaveBeenCalledWith({}, 'r1', { effectiveTo: '2026-11-03' });
    expect(sync.repriceForRate).toHaveBeenCalled();
  });

  it('giá mặc định của ca không đặt được ngày kết thúc', async () => {
    const { repo, service } = setup();
    const err = await service.update(teacher, 'r1', { effectiveTo: '2026-11-03' }).catch((e: unknown) => e);
    expect((err as AppError).code).toBe('VALIDATION_ERROR');
    expect(repo.updateRate).not.toHaveBeenCalled();
  });

  it('kéo dài / bỏ hạn đè lên dòng cùng phạm vi bắt đầu sau → 409', async () => {
    const { repo, service } = setup();
    repo.findRate.mockResolvedValue({ ...rate, studentId: 's1', effectiveTo: '2026-11-01' } as never);
    repo.lockScope.mockResolvedValue([
      { id: 'r1', effectiveFrom: '2026-10-01', effectiveTo: '2026-11-01' },
      { id: 'r2', effectiveFrom: '2026-11-01', effectiveTo: null },
    ]);
    for (const effectiveTo of [null, '2026-11-20']) {
      const err = await service.update(teacher, 'r1', { effectiveTo }).catch((e: unknown) => e);
      expect((err as AppError).code).toBe('CONFLICT');
    }
    await service.update(teacher, 'r1', { effectiveTo: '2026-10-20' });
    expect(repo.updateRate).toHaveBeenCalledTimes(1);
  });

  it('không tìm thấy → 404', async () => {
    const { repo, service } = setup();
    repo.findRate.mockResolvedValue(null);

    await expect(service.update(teacher, 'r1', { note: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
