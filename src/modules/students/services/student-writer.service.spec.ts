import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '../../../common/errors/app-error';
import { type AccessService } from '../../../core/access/access.service';
import { type PrismaService } from '../../../database/prisma.service';
import { type AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { type PasswordService } from '../../auth/services/password.service';
import { type TokenService } from '../../auth/services/token.service';
import { type NotificationsService } from '../../notifications/services/notifications.service';
import { type PermissionsService } from '../../permissions/services/permissions.service';
import { type PointReaderService } from '../../points/services/point-reader.service';
import { type RankingService } from '../../points/services/ranking.service';
import { StudentRepository } from '../repositories/student.repository';
import { StudentReaderService } from './student-reader.service';
import { StudentWriterService } from './student-writer.service';

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
  // Repository thật bọc Prisma mock: assert trên lời gọi Prisma như trước khi tách service
  const repo = new StudentRepository(prisma);
  const reader = new StudentReaderService(
    repo,
    prisma,
    access,
    mockDeep<PointReaderService>(),
    mockDeep<RankingService>(),
    mockDeep<PermissionsService>(),
  );
  const service = new StudentWriterService(
    repo,
    reader,
    access,
    mockDeep<AuditService>(),
    mockDeep<RankingService>(),
    mockDeep<NotificationsService>(),
    mockDeep<PasswordService>(),
    mockDeep<TokenService>(),
  );
  prisma.user.findUnique.mockResolvedValue(studentRow as never);
  access.assertStudentAccess.mockResolvedValue(undefined);
  return { prisma, access, service };
}

describe('StudentWriterService', () => {
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
