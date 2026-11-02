import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type AccessService } from '@/core/access/access.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type ExtraLessonsScheduler } from '@/modules/extra-lessons/jobs/extra-lessons.scheduler';
import { type ExtraSlotRepository } from '@/modules/extra-lessons/repositories/extra-slot.repository';
import { type ExtraAccessService } from '@/modules/extra-lessons/services/extra-access.service';
import { type ExtraSlotReaderService } from '@/modules/extra-lessons/services/extra-slot-reader.service';
import { ExtraSlotWriterService } from '@/modules/extra-lessons/services/extra-slot-writer.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const body = { name: 'Phonics T3', weekday: 2, startTime: '18:00', endTime: '19:30' };

function setup() {
  const repo = mockDeep<ExtraSlotRepository>();
  const reader = mockDeep<ExtraSlotReaderService>();
  const extraAccess = mockDeep<ExtraAccessService>();
  const access = mockDeep<AccessService>();
  const service = new ExtraSlotWriterService(
    repo,
    reader,
    mockDeep<AuditService>(),
    mockDeep<ExtraLessonsScheduler>(),
    extraAccess,
    access,
  );
  repo.transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn({})) as never);
  repo.create.mockResolvedValue({ id: 'slot1' } as never);
  repo.countTeachers.mockImplementation(((ids: string[]) => Promise.resolve(ids.length)) as never);
  repo.findClass.mockResolvedValue({ id: 'c1' } as never);
  reader.find.mockResolvedValue({ id: 'slot1', archivedAt: null, teachers: [] } as never);
  return { repo, extraAccess, access, service };
}

describe('ExtraSlotWriterService (phạm vi GV)', () => {
  it('GV tạo ca → tự phụ trách ca', async () => {
    const { repo, service } = setup();

    await service.create(teacher, { ...body, teacherIds: ['t2'] });

    expect(repo.setTeachers).toHaveBeenCalledWith({}, 'slot1', ['t2', 't1']);
  });

  it('GV gắn ca vào lớp không dạy → FORBIDDEN_SCOPE', async () => {
    const { repo, access, service } = setup();
    access.assertClassAccess.mockRejectedValue(new AppError('FORBIDDEN_SCOPE', 403));

    const err = await service.create(teacher, { ...body, classId: 'c1' }).catch((e: unknown) => e);

    expect((err as AppError).code).toBe('FORBIDDEN_SCOPE');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('GV sửa / lưu trữ ca không dạy → FORBIDDEN_SCOPE', async () => {
    const { repo, extraAccess, service } = setup();
    extraAccess.assertSlotAccess.mockRejectedValue(new AppError('FORBIDDEN_SCOPE', 403));

    await expect(service.update(teacher, 'slot1', { room: 'P2' })).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    await expect(service.archive(teacher, 'slot1')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('GV gán GV mà bỏ mình ra → 400 keepSelfInSlot', async () => {
    const { repo, service } = setup();

    const err = await service.setTeachers(teacher, 'slot1', { teacherIds: ['t2'] }).catch((e: unknown) => e);

    expect((err as AppError).fieldErrors).toEqual({ teacherIds: ['keepSelfInSlot'] });
    expect(repo.setTeachers).not.toHaveBeenCalled();
  });
});
