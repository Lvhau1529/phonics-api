import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '../../common/errors/app-error';
import { type AccessService } from '../../core/access/access.service';
import { type PrismaService } from '../../core/database/prisma.service';
import { type AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';
import { ClassesService } from './classes.service';

const admin: AuthUser = { id: 'admin-1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };

const classRow = {
  id: 'c1',
  name: 'K2A',
  grade: 'K2',
  schoolYear: '2026-2027',
  joinVisible: true,
  archivedAt: null as Date | null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

function setup() {
  const prisma = mockDeep<PrismaService>();
  const access = mockDeep<AccessService>();
  const audit = mockDeep<AuditService>();
  const service = new ClassesService(prisma, access, audit);
  return { prisma, access, audit, service };
}

describe('ClassesService', () => {
  it('archive: đặt archivedAt = now và ghi audit class.update', async () => {
    const { prisma, audit, service } = setup();
    prisma.class.findUnique.mockResolvedValue(classRow as never);
    prisma.class.update.mockImplementation((async (args: { data: { archivedAt?: Date | null } }) => ({
      ...classRow,
      archivedAt: args.data.archivedAt ?? null,
      teachers: [],
      _count: { memberships: 0 },
    })) as never);

    await service.archive(admin, 'c1');

    const call = prisma.class.update.mock.calls[0][0];
    expect(call.data.archivedAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith(
      admin,
      'class.update',
      'Class',
      'c1',
      { archivedAt: null },
      { archivedAt: expect.any(String) },
    );
  });

  it('update archived: false mở lại lớp đã lưu trữ', async () => {
    const { prisma, service } = setup();
    const archived = { ...classRow, archivedAt: new Date('2026-09-10T00:00:00Z') };
    prisma.class.findUnique.mockResolvedValue(archived as never);
    prisma.class.update.mockResolvedValue({ ...classRow, teachers: [], _count: { memberships: 3 } } as never);

    const view = await service.update(admin, 'c1', { archived: false });

    expect(prisma.class.update.mock.calls[0][0].data.archivedAt).toBeNull();
    expect(view.archivedAt).toBeNull();
    expect(view.studentCount).toBe(3);
  });

  it('create: teacherIds không phải TEACHER → 400 VALIDATION_ERROR kèm details', async () => {
    const { prisma, service } = setup();
    prisma.user.findMany.mockResolvedValue([{ id: 't1' }] as never);

    const err = await service
      .create(admin, {
        name: 'K2A',
        grade: 'K2',
        schoolYear: '2026-2027',
        joinVisible: true,
        teacherIds: ['t1', 's1'],
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('VALIDATION_ERROR');
    expect((err as AppError).getStatus()).toBe(400);
    expect((err as AppError).details?.teacherIds).toHaveLength(1);
    expect(prisma.class.create).not.toHaveBeenCalled();
  });

  it('create: trùng (name, schoolYear) → 409 CONFLICT', async () => {
    const { prisma, service } = setup();
    prisma.user.findMany.mockResolvedValue([] as never);
    prisma.class.findFirst.mockResolvedValue({ id: 'other' } as never);

    const err = await service
      .create(admin, { name: 'K2A', grade: 'K2', schoolYear: '2026-2027', joinVisible: true, teacherIds: [] })
      .catch((e: unknown) => e);

    expect((err as AppError).code).toBe('CONFLICT');
    expect((err as AppError).getStatus()).toBe(409);
  });
});
