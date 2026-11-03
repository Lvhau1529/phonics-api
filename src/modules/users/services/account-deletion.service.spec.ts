import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type AccountDeletionRepository } from '@/modules/users/repositories/account-deletion.repository';
import { AccountDeletionService, toPreview } from '@/modules/users/services/account-deletion.service';

const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };
const user = (id: string, role: 'STUDENT' | 'TEACHER' | 'ADMIN') => ({
  id,
  role,
  email: null,
  displayName: 'X',
  status: 'ACTIVE' as const,
});

function setup() {
  const repo = mockDeep<AccountDeletionRepository>();
  const audit = mockDeep<AuditService>();
  repo.transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn({})) as never);
  return { repo, audit, service: new AccountDeletionService(repo, audit) };
}

const studentCounts = (confirmed: number) => ({
  impact: {
    classes: 1,
    guardians: 0,
    gameResults: 4,
    pointEntries: 0,
    submissions: 0,
    attendance: 2,
    slotAssignments: 1,
  },
  confirmed,
});

describe('toPreview', () => {
  it('bỏ dòng 0, canDelete theo blockers', () => {
    expect(toPreview({ classes: 0, gameResults: 3 }, [])).toEqual({
      canDelete: true,
      blockers: [],
      impact: [{ key: 'gameResults', count: 3 }],
    });
    expect(toPreview({}, ['media']).canDelete).toBe(false);
  });
});

describe('AccountDeletionService', () => {
  it('xoá học sinh chưa có buổi đã xác nhận + ghi audit kèm ảnh hưởng', async () => {
    const { repo, audit, service } = setup();
    repo.findUser.mockResolvedValue(user('s1', 'STUDENT'));
    repo.studentCounts.mockResolvedValue(studentCounts(0));

    await service.deleteStudent(admin, 's1');

    expect(repo.deleteUser).toHaveBeenCalledWith({}, 's1');
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'student.delete',
      'User',
      's1',
      expect.objectContaining({ impact: expect.arrayContaining([{ key: 'gameResults', count: 4 }]) }),
      null,
    );
  });

  it('học sinh có buổi đã xác nhận → 409 ACCOUNT_NOT_DELETABLE, không xoá', async () => {
    const { repo, service } = setup();
    repo.findUser.mockResolvedValue(user('s1', 'STUDENT'));
    repo.studentCounts.mockResolvedValue(studentCounts(2));

    await expect(service.deleteStudent(admin, 's1')).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_DELETABLE',
      details: { blockers: ['confirmedAttendance'] },
    });
    expect(repo.deleteUser).not.toHaveBeenCalled();
  });

  it('id không đúng role → 404 (không xoá nhầm admin qua route giáo viên)', async () => {
    const { repo, service } = setup();
    repo.findUser.mockResolvedValue(user('a2', 'ADMIN'));
    await expect(service.deleteTeacher(admin, 'a2')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.deleteUser).not.toHaveBeenCalled();
  });

  it('giáo viên đã soạn nội dung / có media → chặn', async () => {
    const { repo, service } = setup();
    repo.findUser.mockResolvedValue(user('t1', 'TEACHER'));
    repo.teacherCounts.mockResolvedValue({
      impact: { classes: 2, extraSlots: 0, comments: 0 },
      authored: 3,
      media: 1,
    });
    expect(await service.teacherPreview('t1')).toEqual({
      canDelete: false,
      blockers: ['authoredContent', 'media'],
      impact: [{ key: 'classes', count: 2 }],
    });
  });

  it('xoá phụ huynh có tài khoản gia đình: thu hồi phiên hồ sơ bé + xoá user PARENT', async () => {
    const { repo, audit, service } = setup();
    repo.findGuardian.mockResolvedValue({
      id: 'g1',
      fullName: 'Mẹ An',
      email: 'me@x.vn',
      phone: null,
      userId: 'p1',
      user: { role: 'PARENT' },
    });
    repo.countChildren.mockResolvedValue(2);

    await service.deleteGuardian(admin, 'g1');

    expect(repo.deleteGuardian).toHaveBeenCalledWith({}, 'g1');
    expect(repo.revokeActorSessions).toHaveBeenCalledWith({}, 'p1', expect.any(Date));
    expect(repo.deleteUser).toHaveBeenCalledWith({}, 'p1');
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'guardian.delete',
      'Guardian',
      'g1',
      expect.objectContaining({
        fullName: 'Mẹ An',
        impact: [
          { key: 'children', count: 2 },
          { key: 'familyAccount', count: 1 },
        ],
      }),
      null,
    );
  });

  it('phụ huynh gắn với user không phải PARENT → chỉ xoá phụ huynh, giữ user', async () => {
    const { repo, service } = setup();
    repo.findGuardian.mockResolvedValue({
      id: 'g1',
      fullName: 'Cô Lan',
      email: null,
      phone: null,
      userId: 't1',
      user: { role: 'TEACHER' },
    });
    repo.countChildren.mockResolvedValue(0);

    await service.deleteGuardian(admin, 'g1');

    expect(repo.deleteGuardian).toHaveBeenCalled();
    expect(repo.deleteUser).not.toHaveBeenCalled();
  });
});
