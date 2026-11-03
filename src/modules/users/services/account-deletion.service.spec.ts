import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type TimeService } from '@/core/time/time.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type AccountDeletionRepository } from '@/modules/users/repositories/account-deletion.repository';
import { AccountDeletionService, toPreview } from '@/modules/users/services/account-deletion.service';

const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };
const user = (id: string, role: 'STUDENT' | 'TEACHER' | 'ADMIN') => ({
  id,
  role,
  email: `${id}@x.vn`,
  googleSub: null,
  displayName: 'X',
  status: 'ACTIVE' as const,
});

function setup() {
  const repo = mockDeep<AccountDeletionRepository>();
  const audit = mockDeep<AuditService>();
  const time = mockDeep<TimeService>();
  time.toIsoDate.mockReturnValue('2026-11-03');
  repo.transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn({})) as never);
  return { repo, audit, service: new AccountDeletionService(repo, audit, time) };
}

const studentLinks = {
  memberships: [{ id: 'm1', classId: 'c1' }],
  guardians: [],
  assignments: [{ id: 'sa1', slotId: 'x1', effectiveFrom: '2026-09-01', effectiveTo: null }],
};

describe('toPreview', () => {
  it('bỏ dòng 0, canDelete theo blockers', () => {
    expect(toPreview({ classes: 0, slotAssignments: 3 }, [])).toEqual({
      canDelete: true,
      blockers: [],
      impact: [{ key: 'slotAssignments', count: 3 }],
    });
    expect(toPreview({}, ['media']).canDelete).toBe(false);
  });
});

describe('AccountDeletionService (xoá mềm)', () => {
  it('học sinh: gỡ lớp / ca / phụ huynh rồi đánh dấu xoá, lưu email + liên kết vào snapshot', async () => {
    const { repo, audit, service } = setup();
    repo.findUser.mockResolvedValue(user('s1', 'STUDENT'));
    repo.studentLinks.mockResolvedValue(studentLinks);

    await service.deleteStudent(admin, 's1');

    expect(repo.detachStudent).toHaveBeenCalledWith({}, 's1', expect.any(Date), '2026-11-03');
    expect(repo.softDeleteUser).toHaveBeenCalledWith({}, 's1', {
      at: expect.any(Date),
      byId: 'a1',
      snapshot: expect.objectContaining({ email: 's1@x.vn', memberships: studentLinks.memberships }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'student.delete',
      'User',
      's1',
      expect.objectContaining({ email: 's1@x.vn' }),
      { deletedAt: expect.any(String) },
    );
  });

  it('preview học sinh: chỉ liệt kê liên kết sẽ gỡ, luôn xoá được', async () => {
    const { repo, service } = setup();
    repo.findUser.mockResolvedValue(user('s1', 'STUDENT'));
    repo.studentLinks.mockResolvedValue(studentLinks);
    expect(await service.studentPreview('s1')).toEqual({
      canDelete: true,
      blockers: [],
      impact: [
        { key: 'classes', count: 1 },
        { key: 'slotAssignments', count: 1 },
      ],
    });
  });

  it('id không đúng role hoặc đã xoá → 404', async () => {
    const { repo, service } = setup();
    repo.findUser.mockResolvedValue(user('a2', 'ADMIN'));
    await expect(service.deleteTeacher(admin, 'a2')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    repo.findUser.mockResolvedValue(null);
    await expect(service.deleteStudent(admin, 's9')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.softDeleteUser).not.toHaveBeenCalled();
  });

  it('giáo viên: gỡ khỏi lớp / ca, giữ nội dung đã soạn', async () => {
    const { repo, service } = setup();
    repo.findUser.mockResolvedValue(user('t1', 'TEACHER'));
    repo.teacherLinks.mockResolvedValue({ classIds: ['c1', 'c2'], slotIds: [] });

    expect(await service.teacherPreview('t1')).toEqual({
      canDelete: true,
      blockers: [],
      impact: [{ key: 'classes', count: 2 }],
    });
    await service.deleteTeacher(admin, 't1');
    expect(repo.detachTeacher).toHaveBeenCalledWith({}, 't1');
    expect(repo.softDeleteUser).toHaveBeenCalledWith(
      {},
      't1',
      expect.objectContaining({ snapshot: expect.objectContaining({ classIds: ['c1', 'c2'] }) }),
    );
  });

  it('phụ huynh có tài khoản gia đình: xoá mềm phụ huynh + thu hồi phiên hồ sơ bé + khoá user PARENT', async () => {
    const { repo, audit, service } = setup();
    repo.findGuardian.mockResolvedValue({
      id: 'g1',
      fullName: 'Mẹ An',
      email: 'me@x.vn',
      phone: null,
      userId: 'p1',
      user: { role: 'PARENT', email: 'me@x.vn', googleSub: 'gs', status: 'ACTIVE' },
    });
    const links = [
      {
        studentId: 's1',
        relation: 'MOTHER' as const,
        isBillingContact: true,
        receivesReports: true,
        canAccess: true,
      },
    ];
    repo.guardianLinks.mockResolvedValue(links);

    await service.deleteGuardian(admin, 'g1');

    expect(repo.softDeleteGuardian).toHaveBeenCalledWith({}, 'g1', {
      at: expect.any(Date),
      byId: 'a1',
      snapshot: { email: 'me@x.vn', students: links },
    });
    expect(repo.revokeActorSessions).toHaveBeenCalledWith({}, 'p1', expect.any(Date));
    expect(repo.softDeleteUser).toHaveBeenCalledWith(
      {},
      'p1',
      expect.objectContaining({ snapshot: { email: 'me@x.vn', googleSub: 'gs', status: 'ACTIVE' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'guardian.delete',
      'Guardian',
      'g1',
      expect.objectContaining({ fullName: 'Mẹ An', students: links }),
      { deletedAt: expect.any(String) },
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
      user: { role: 'TEACHER', email: 't1@x.vn', googleSub: null, status: 'ACTIVE' },
    });
    repo.guardianLinks.mockResolvedValue([]);

    await service.deleteGuardian(admin, 'g1');

    expect(repo.softDeleteGuardian).toHaveBeenCalled();
    expect(repo.softDeleteUser).not.toHaveBeenCalled();
  });
});
