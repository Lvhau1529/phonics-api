import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type AccessService } from '@/core/access/access.service';
import { type PrismaService } from '@/database/prisma.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type PasswordService } from '@/modules/auth/services/password.service';
import { type TokenService } from '@/modules/auth/services/token.service';
import { type GuardianReaderService } from '@/modules/families/services/guardian-reader.service';
import { type GuardianWriterService } from '@/modules/families/services/guardian-writer.service';
import { type NotificationsService } from '@/modules/notifications/services/notifications.service';
import { type PointReaderService } from '@/modules/points/services/point-reader.service';
import { type RankingService } from '@/modules/points/services/ranking.service';
import { StudentRepository } from '@/modules/students/repositories/student.repository';
import { StudentReaderService } from '@/modules/students/services/student-reader.service';
import { StudentWriterService } from '@/modules/students/services/student-writer.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };

const studentRow = {
  id: 's1',
  email: 'kid@example.com',
  role: 'STUDENT',
  status: 'ACTIVE',
  loginMode: 'OWN',
  provider: 'LOCAL',
  displayName: 'Kid',
  avatarKey: 'pip',
  lastLoginAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  studentProfile: {
    vietnameseName: 'Nguyễn Văn Kid',
    englishName: 'Kid',
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
    mockDeep<GuardianReaderService>(),
  );
  const audit = mockDeep<AuditService>();
  const service = new StudentWriterService(
    repo,
    reader,
    access,
    audit,
    mockDeep<RankingService>(),
    mockDeep<NotificationsService>(),
    mockDeep<PasswordService>(),
    mockDeep<TokenService>(),
    mockDeep<GuardianWriterService>(),
  );
  prisma.user.findFirst.mockResolvedValue(studentRow as never);
  // Transaction chạy callback với chính Prisma mock
  prisma.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  access.assertStudentAccess.mockResolvedValue(undefined);
  return { prisma, access, audit, reader, service };
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

  it('update: GV đổi tên tiếng Anh → display_name + cột tìm / sắp xếp đồng bộ, audit chỉ trường đổi', async () => {
    const { prisma, audit, reader, service } = setup();
    vi.spyOn(reader, 'toDetail').mockResolvedValue({} as never);
    prisma.user.update.mockResolvedValue({
      ...studentRow,
      displayName: 'Andy',
      studentProfile: { ...studentRow.studentProfile, englishName: 'Andy' },
    } as never);

    await service.update(teacher, 's1', { englishName: ' Andy ' });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.displayName).toBe('Andy');
    expect((data.studentProfile as { upsert: { update: unknown } }).upsert.update).toEqual({
      vietnameseName: 'Nguyễn Văn Kid',
      englishName: 'Andy',
      nameSearch: 'nguyen van kid andy',
      nameSortKey: 'kid nguyen van kid',
    });
    expect(audit.record).toHaveBeenCalledWith(
      teacher,
      'student.update',
      'User',
      's1',
      { englishName: 'Kid' },
      { englishName: 'Andy' },
    );
  });

  it('update: displayName của client cũ sửa tên đang hiển thị (tên tiếng Anh), không đụng tên tiếng Việt', async () => {
    const { prisma, reader, service } = setup();
    vi.spyOn(reader, 'toDetail').mockResolvedValue({} as never);
    prisma.user.update.mockResolvedValue(studentRow as never);

    await service.update(admin, 's1', { displayName: 'Kiddo' });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.displayName).toBe('Kiddo');
    expect((data.studentProfile as { upsert: { update: unknown } }).upsert.update).toMatchObject({
      vietnameseName: 'Nguyễn Văn Kid',
      englishName: 'Kiddo',
    });
  });

  it('update: không đổi tên → không ghi display_name / cột tên', async () => {
    const { prisma, reader, service } = setup();
    vi.spyOn(reader, 'toDetail').mockResolvedValue({} as never);
    prisma.user.update.mockResolvedValue(studentRow as never);

    await service.update(admin, 's1', { avatarKey: 'cat', vietnameseName: 'Nguyễn Văn Kid' });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.displayName).toBeUndefined();
    expect(data.studentProfile).toBeUndefined();
  });

  it('update: học sinh không tồn tại → 404', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue(null);

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

  it('resetPassword: học sinh MANAGED → 409 STUDENT_IS_MANAGED, không đổi mật khẩu', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue({ ...studentRow, loginMode: 'MANAGED', email: null } as never);
    await expect(service.resetPassword(admin, 's1', { newPassword: 'secret1' })).rejects.toMatchObject({
      code: 'STUDENT_IS_MANAGED',
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('update: cấp email cho học sinh MANAGED → tự đăng nhập (OWN)', async () => {
    const { prisma, service, reader } = setup();
    prisma.user.findFirst
      .mockResolvedValueOnce({ ...studentRow, loginMode: 'MANAGED', email: null } as never)
      .mockResolvedValueOnce(null);
    prisma.user.update.mockResolvedValue(studentRow as never);
    vi.spyOn(reader, 'toDetail').mockResolvedValue({} as never);

    await service.update(admin, 's1', { email: 'big.kid@example.com' });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
      email: 'big.kid@example.com',
      loginMode: 'OWN',
    });
  });

  it('update: không đổi tay trạng thái học sinh đang chờ duyệt', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue({ ...studentRow, status: 'PENDING' } as never);
    await expect(service.update(admin, 's1', { status: 'ACTIVE' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
