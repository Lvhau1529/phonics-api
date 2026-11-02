import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type ExtraScheduleRepository } from '@/modules/extra-lessons/repositories/extra-schedule.repository';
import { type ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { type ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { type SessionSyncService } from '@/modules/extra-lessons/services/session-sync.service';
import { SlotAssignmentService } from '@/modules/extra-lessons/services/slot-assignment.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const row = {
  id: 'a1',
  studentId: 's1',
  slotId: 'slot1',
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  note: null,
};

function setup() {
  const repo = mockDeep<ExtraScheduleRepository>();
  const access = mockDeep<ExtraAccessService>();
  const audit = mockDeep<AuditService>();
  const sync = mockDeep<SessionSyncService>();
  const service = new SlotAssignmentService(repo, mockDeep<ExtraSlotReaderService>(), access, audit, sync);
  repo.findAssignment.mockResolvedValue(row as never);
  sync.syncStudent.mockResolvedValue([]);
  return { repo, access, audit, sync, service };
}

describe('SlotAssignmentService.remove', () => {
  it('xoá dòng, ghi audit, đồng bộ buổi trong khoảng của dòng và trả buổi đã xác nhận bị lệch', async () => {
    const { repo, audit, sync, service } = setup();
    const affected = [{ sessionId: 'x1', date: '2026-10-06', slotName: 'T3', change: 'REMOVE' as const }];
    sync.syncStudent.mockResolvedValue(affected);

    const res = await service.remove(teacher, 's1', 'a1');

    expect(repo.deleteAssignment).toHaveBeenCalledWith('a1');
    expect(audit.record).toHaveBeenCalledWith(
      teacher,
      'slotAssignment.delete',
      'User',
      's1',
      expect.objectContaining({ assignmentId: 'a1', slotId: 'slot1' }),
      null,
    );
    expect(sync.syncStudent).toHaveBeenCalledWith('s1', ['slot1'], '2026-10-01', null);
    expect(res).toEqual({ affectedSessions: affected });
  });

  it('dòng của học sinh khác → 404, không xoá', async () => {
    const { repo, service } = setup();

    await expect(service.remove(teacher, 's2', 'a1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.deleteAssignment).not.toHaveBeenCalled();
  });

  it('GV không dạy ca → FORBIDDEN_SCOPE, không xoá', async () => {
    const { repo, access, service } = setup();
    access.assertSlotAccess.mockRejectedValue(new AppError('FORBIDDEN_SCOPE', 403));

    await expect(service.remove(teacher, 's1', 'a1')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect(repo.deleteAssignment).not.toHaveBeenCalled();
  });
});
