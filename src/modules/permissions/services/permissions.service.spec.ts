import { ROLE_DEFAULT_PERMISSIONS } from '@phonics/contracts';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type PrismaService } from '@/database/prisma.service';
import { PermissionRepository } from '@/modules/permissions/repositories/permission.repository';
import { PermissionsService } from '@/modules/permissions/services/permissions.service';

function setup(overrides: { permission: string; effect: 'GRANT' | 'REVOKE' }[], groups: string[][] = []) {
  const prisma = mockDeep<PrismaService>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.userPermission.findMany.mockResolvedValue(overrides as any);
  prisma.userPermissionGroup.findMany.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groups.map((g) => ({ group: { permissions: g } })) as any,
  );
  return new PermissionsService(new PermissionRepository(prisma));
}

describe('PermissionsService.effectiveFor', () => {
  it('giáo viên mặc định: cộng điểm được, chuyển lớp không', async () => {
    const svc = setup([]);
    const set = await svc.effectiveFor({ id: 't1', role: 'TEACHER' });
    expect(set.has('points.award')).toBe(true);
    expect(set.has('class.changeStudentClass')).toBe(false);
  });

  it('GRANT thêm quyền, REVOKE bỏ quyền mặc định, mã lạ bị bỏ qua', async () => {
    const svc = setup([
      { permission: 'class.changeStudentClass', effect: 'GRANT' },
      { permission: 'points.award', effect: 'REVOKE' },
      { permission: 'legacy.unknown', effect: 'GRANT' },
    ]);
    const set = await svc.effectiveFor({ id: 't1', role: 'TEACHER' });
    expect(set.has('class.changeStudentClass')).toBe(true);
    expect(set.has('points.award')).toBe(false);
    // mặc định của TEACHER + 1 grant − 1 revoke (mã lạ bị bỏ qua)
    expect(set.size).toBe(ROLE_DEFAULT_PERMISSIONS.TEACHER.length);
  });

  it('nhóm quyền cộng thêm quyền; REVOKE vẫn thắng nhóm', async () => {
    const svc = setup(
      [{ permission: 'points.award', effect: 'REVOKE' }],
      [['games.unlock', 'points.award', 'bogus']],
    );
    const set = await svc.effectiveFor({ id: 't1', role: 'TEACHER' });
    expect(set.has('games.unlock')).toBe(true);
    expect(set.has('points.award')).toBe(false);
  });

  it('admin có mọi quyền mà không cần query', async () => {
    const svc = setup([]);
    const set = await svc.effectiveFor({ id: 'a', role: 'ADMIN' });
    expect(set.has('games.manage')).toBe(true);
  });
});
