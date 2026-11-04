import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type TimeService } from '@/core/time/time.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type ExtraLessonsScheduler } from '@/modules/extra-lessons/jobs/extra-lessons.scheduler';
import { type AttendanceRepository } from '@/modules/extra-lessons/repositories/attendance.repository';
import { type ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { type ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { type AttendanceReaderService } from '@/modules/extra-lessons/services/attendance-reader.service';
import { AttendanceWriterService } from '@/modules/extra-lessons/services/attendance-writer.service';
import { type ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { type SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };

function setup(row: Record<string, unknown>) {
  const repo = mockDeep<AttendanceRepository>();
  const reader = mockDeep<AttendanceReaderService>();
  const audit = mockDeep<AuditService>();
  const sync = mockDeep<SessionSyncService>();
  const scheduler = mockDeep<ExtraLessonsScheduler>();
  const service = new AttendanceWriterService(
    repo,
    mockDeep<ExtraScheduleRepository>(),
    mockDeep<ExtraSlotRepository>(),
    reader,
    mockDeep<ExtraAccessService>(),
    audit,
    {} as TimeService,
    sync,
    scheduler,
  );
  repo.transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn({})) as never);
  reader.find.mockResolvedValue({
    id: 's1',
    slotId: 'slot1',
    date: '2026-11-02',
    teacherIds: ['t1'],
    ...row,
  } as never);
  reader.detail.mockResolvedValue({ id: 's1' } as never);
  return { repo, reader, audit, sync, scheduler, service };
}

describe('AttendanceWriterService.restore', () => {
  it('buổi huỷ chưa có học sinh → chụp danh sách từ lịch, về PENDING, đặt lại số lần nhắc', async () => {
    const { repo, sync, scheduler, audit, service } = setup({
      status: 'CANCELLED',
      cancelReason: 'Lễ',
      records: [],
    });
    const records = [
      {
        studentId: 'st1',
        mark: 'PRESENT' as const,
        unitPrice: 100,
        rateId: 'r1',
        charged: true,
        source: 'SNAPSHOT',
      },
    ];
    sync.rosterRecords.mockResolvedValue(records);

    await service.restore(teacher, 's1');

    expect(sync.rosterRecords).toHaveBeenCalledWith('slot1', '2026-11-02');
    expect(repo.createRecords).toHaveBeenCalledWith({}, 's1', records);
    expect(repo.touchSession).toHaveBeenCalledWith({}, 's1', {
      status: 'PENDING',
      cancelReason: null,
      confirmedById: null,
      confirmedAt: null,
      confirmedVia: null,
      digestCount: 0,
    });
    expect(audit.record).toHaveBeenCalledWith(
      teacher,
      'attendance.restoreSession',
      'AttendanceSession',
      's1',
      { status: 'CANCELLED', cancelReason: 'Lễ' },
      { status: 'PENDING', snapshotRecords: 1 },
    );
    expect(scheduler.reschedule).toHaveBeenCalled();
  });

  it('buổi đã có học sinh → giữ nguyên danh sách', async () => {
    const { repo, sync, service } = setup({
      status: 'CANCELLED',
      cancelReason: 'x',
      records: [{ studentId: 'st1' }],
    });
    await service.restore(teacher, 's1');
    expect(sync.rosterRecords).not.toHaveBeenCalled();
    expect(repo.createRecords).not.toHaveBeenCalled();
  });

  it('buổi chưa huỷ → 409', async () => {
    const { repo, service } = setup({ status: 'PENDING', cancelReason: null, records: [] });
    await expect(service.restore(teacher, 's1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(repo.touchSession).not.toHaveBeenCalled();
  });
});
