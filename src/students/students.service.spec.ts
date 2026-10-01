import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { type AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';
import { type PasswordService } from '../auth/password.service';
import { type TokenService } from '../auth/token.service';
import { type AccessService } from '../common/access/access.service';
import { AppError } from '../common/errors/app-error';
import { type TimeService } from '../common/time/time.service';
import { type NotificationsService } from '../notifications/notifications.service';
import { type PermissionsService } from '../permissions/permissions.service';
import { type PointsService } from '../points/points.service';
import { type RankingService } from '../points/ranking.service';
import { type PrismaService } from '../prisma/prisma.service';
import { StudentsService } from './students.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };

const studentRow = {
  id: 's1',
  email: 'kid@example.com',
  role: 'STUDENT',
  status: 'ACTIVE',
  provider: 'LOCAL',
  displayName: 'Kid',
  avatarKey: 'pip',
  lastLoginAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  studentProfile: {
    parentName: null,
    parentEmail: null,
    parentPhone: null,
    notes: null,
    memberships: [
      {
        joinedAt: new Date('2026-09-01T00:00:00Z'),
        class: { id: 'c1', name: 'K2A', grade: 'K2', schoolYear: '2026-2027' },
      },
    ],
  },
};

function setup() {
  const prisma = mockDeep<PrismaService>();
  const access = mockDeep<AccessService>();
  const service = new StudentsService(
    prisma,
    access,
    mockDeep<AuditService>(),
    mockDeep<PointsService>(),
    mockDeep<RankingService>(),
    mockDeep<NotificationsService>(),
    mockDeep<PermissionsService>(),
    mockDeep<PasswordService>(),
    mockDeep<TokenService>(),
    mockDeep<TimeService>(),
  );
  prisma.user.findUnique.mockResolvedValue(studentRow as never);
  access.assertStudentAccess.mockResolvedValue(undefined);
  return { prisma, access, service };
}

describe('StudentsService', () => {
  it('update: TEACHER gửi trường ngoài displayName / avatarKey → 403 FORBIDDEN_PERMISSION', async () => {
    const { prisma, service } = setup();

    const err = await service
      .update(teacher, 's1', { displayName: 'New', email: 'x@example.com' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('FORBIDDEN_PERMISSION');
    expect((err as AppError).getStatus()).toBe(403);
    expect((err as AppError).details?.fields).toEqual(['email']);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('update: học sinh không tồn tại → 404', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(null);

    const err = await service.update(admin, 'nope', { displayName: 'New' }).catch((e: unknown) => e);

    expect((err as AppError).code).toBe('NOT_FOUND');
  });

  it('moveClass: sang đúng lớp đang học → 409 CONFLICT, không mở transaction', async () => {
    const { prisma, service } = setup();

    const err = await service.moveClass(admin, 's1', { classId: 'c1' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('CONFLICT');
    expect((err as AppError).getStatus()).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('moveClass: lớp đích đã lưu trữ → 400 CLASS_NOT_JOINABLE', async () => {
    const { prisma, service } = setup();
    prisma.class.findUnique.mockResolvedValue({
      id: 'c2',
      name: 'K2B',
      grade: 'K2',
      archivedAt: new Date(),
    } as never);

    const err = await service.moveClass(admin, 's1', { classId: 'c2' }).catch((e: unknown) => e);

    expect((err as AppError).code).toBe('CLASS_NOT_JOINABLE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
