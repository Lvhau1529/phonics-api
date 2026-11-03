import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type AccessService } from '@/core/access/access.service';
import { type TimeService } from '@/core/time/time.service';
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
    { timeZone: 'Asia/Ho_Chi_Minh' } as TimeService,
  );
  repo.transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn({})) as never);
  repo.create.mockResolvedValue({ id: 'slot1' } as never);
  repo.countTeachers.mockImplementation(((ids: string[]) => Promise.resolve(ids.length)) as never);
  repo.findClass.mockResolvedValue({ id: 'c1' } as never);
  reader.find.mockResolvedValue({
    id: 'slot1',
    archivedAt: null,
    teachers: [],
    startTime: '18:00',
    endTime: '19:30',
  } as never);
  reader.today.mockReturnValue('2026-11-02');
  return { repo, reader, extraAccess, access, service };
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

describe('ExtraSlotWriterService (đổi giờ)', () => {
  const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };

  it('đổi giờ → cập nhật buổi đã tạo từ hôm nay (mặc định), tính lại mốc giờ', async () => {
    const { repo, service } = setup();
    repo.sessionsFrom.mockResolvedValue([{ id: 's1', date: '2026-11-02' }]);

    await service.update(admin, 'slot1', { startTime: '17:00', endTime: '18:30' });

    expect(repo.update).toHaveBeenCalledWith({}, 'slot1', { startTime: '17:00', endTime: '18:30' });
    expect(repo.sessionsFrom).toHaveBeenCalledWith({}, 'slot1', '2026-11-02');
    expect(repo.updateSessionTime).toHaveBeenCalledWith({}, 's1', {
      startTime: '17:00',
      endTime: '18:30',
      startsAt: new Date('2026-11-02T10:00:00Z'),
      endsAt: new Date('2026-11-02T11:30:00Z'),
    });
  });

  it('timeFrom chọn ngày áp; không đổi giờ thì không đụng buổi', async () => {
    const { repo, service } = setup();
    repo.sessionsFrom.mockResolvedValue([]);

    await service.update(admin, 'slot1', { startTime: '17:00', endTime: '18:30', timeFrom: '2026-10-01' });
    expect(repo.sessionsFrom).toHaveBeenCalledWith({}, 'slot1', '2026-10-01');

    repo.sessionsFrom.mockClear();
    await service.update(admin, 'slot1', { room: 'P2' });
    await service.update(admin, 'slot1', { startTime: '18:00', endTime: '19:30' });
    expect(repo.sessionsFrom).not.toHaveBeenCalled();
  });
});

describe('ExtraSlotWriterService (ngừng ca)', () => {
  const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };

  it('đặt ngày ngừng trong tương lai: học sinh rời ca + huỷ buổi chờ từ ngày đó, chưa chuyển đã ngừng', async () => {
    const { repo, service } = setup();
    repo.closeAssignments.mockResolvedValue(3);
    repo.cancelPendingFrom.mockResolvedValue(0);

    await service.update(admin, 'slot1', { endsOn: '2026-12-01' });

    expect(repo.closeAssignments).toHaveBeenCalledWith({}, 'slot1', '2026-12-01');
    expect(repo.cancelPendingFrom).toHaveBeenCalledWith({}, 'slot1', '2026-12-01', expect.any(String));
    expect(repo.update).not.toHaveBeenCalledWith({}, 'slot1', { archivedAt: expect.any(Date) });
  });

  it('ngày ngừng đã tới → chuyển đã ngừng ngay', async () => {
    const { repo, service } = setup();
    await service.update(admin, 'slot1', { endsOn: '2026-11-02' });
    expect(repo.update).toHaveBeenCalledWith({}, 'slot1', { archivedAt: expect.any(Date) });
  });

  it('bỏ ngày ngừng (null) không đụng lịch học sinh', async () => {
    const { repo, reader, service } = setup();
    reader.find.mockResolvedValue({
      id: 'slot1',
      archivedAt: null,
      teachers: [],
      startTime: '18:00',
      endTime: '19:30',
      endsOn: '2026-12-01',
    } as never);
    await service.update(admin, 'slot1', { endsOn: null });
    expect(repo.closeAssignments).not.toHaveBeenCalled();
  });

  it('ngày ngừng phải sau ngày bắt đầu (so với giá trị đang lưu)', async () => {
    const { reader, service } = setup();
    reader.find.mockResolvedValue({
      id: 'slot1',
      archivedAt: null,
      teachers: [],
      startTime: '18:00',
      endTime: '19:30',
      startsOn: '2026-12-10',
    } as never);
    await expect(service.update(admin, 'slot1', { endsOn: '2026-12-01' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('tạo ca với ngày ngừng không sau hôm nay → lỗi', async () => {
    const { service } = setup();
    await expect(service.create(admin, { ...body, endsOn: '2026-11-02' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('ngừng ngay (archive) = ngày ngừng hôm nay', async () => {
    const { repo, service } = setup();
    await service.archive(admin, 'slot1');
    expect(repo.update).toHaveBeenCalledWith({}, 'slot1', { endsOn: '2026-11-02' });
    expect(repo.closeAssignments).toHaveBeenCalledWith({}, 'slot1', '2026-11-02');
    expect(repo.update).toHaveBeenCalledWith({}, 'slot1', { archivedAt: expect.any(Date) });
  });
});
