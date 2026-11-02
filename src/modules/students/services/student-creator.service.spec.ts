import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type AccessService } from '@/core/access/access.service';
import { type PrismaService } from '@/database/prisma.service';
import { type AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type ExtraEnrollmentService } from '@/modules/extra-lessons/services/extra-enrollment.service';
import { type GuardianWriterService } from '@/modules/families/services/guardian-writer.service';
import { type RankingService } from '@/modules/points/services/ranking.service';
import { StudentRepository } from '@/modules/students/repositories/student.repository';
import { StudentCreatorService } from '@/modules/students/services/student-creator.service';
import { type StudentReaderService } from '@/modules/students/services/student-reader.service';

const teacher: AuthUser = { id: 't1', role: 'TEACHER', status: 'ACTIVE', tokenVersion: 0 };
const admin: AuthUser = { id: 'a1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 };
const classId = '00000000-0000-4000-8000-0000000000c1';
const slotId = '00000000-0000-4000-8000-0000000000e1';

function setup() {
  const prisma = mockDeep<PrismaService>();
  const repo = new StudentRepository(prisma);
  const reader = mockDeep<StudentReaderService>();
  const access = mockDeep<AccessService>();
  const enrollment = mockDeep<ExtraEnrollmentService>();
  const guardians = mockDeep<GuardianWriterService>();
  const ranking = mockDeep<RankingService>();
  const audit = mockDeep<AuditService>();
  const service = new StudentCreatorService(repo, reader, access, enrollment, guardians, ranking, audit);

  prisma.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  let n = 0;
  prisma.user.create.mockImplementation((() => Promise.resolve({ id: `s${++n}` })) as never);
  prisma.class.findUnique.mockResolvedValue({ id: classId, archivedAt: null } as never);
  enrollment.today.mockReturnValue('2026-11-02');
  enrollment.syncAfterEnroll.mockResolvedValue([]);
  reader.findStudent.mockImplementation(((id: string) => Promise.resolve({ id })) as never);
  reader.toDetail.mockImplementation(((_u: AuthUser, row: { id: string }) => Promise.resolve(row)) as never);
  return { prisma, access, enrollment, guardians, ranking, audit, service };
}

describe('StudentCreatorService', () => {
  it('GV không chọn lớp / ca → 400 placementRequired, không tạo gì', async () => {
    const { prisma, service } = setup();

    const err = await service
      .create(teacher, { students: [{ vietnameseName: 'Nguyễn An' }] })
      .catch((e: unknown) => e);

    expect((err as AppError).code).toBe('VALIDATION_ERROR');
    expect((err as AppError).fieldErrors).toEqual({ 'students.0.classId': ['placementRequired'] });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('GV thêm vào lớp không dạy → FORBIDDEN_SCOPE trước khi ghi', async () => {
    const { prisma, access, service } = setup();
    access.assertClassAccess.mockRejectedValue(new AppError('FORBIDDEN_SCOPE', 403));

    const err = await service
      .create(teacher, { students: [{ vietnameseName: 'Nguyễn An', classId }] })
      .catch((e: unknown) => e);

    expect((err as AppError).code).toBe('FORBIDDEN_SCOPE');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('hai anh em vào ca của GV, mỗi bé một giá, chung một phụ huynh', async () => {
    const { prisma, enrollment, guardians, audit, service } = setup();
    enrollment.syncAfterEnroll.mockResolvedValueOnce([
      { sessionId: 'x1', date: '2026-10-27', slotName: 'T3', change: 'ADD' },
    ]);
    const parent = { name: 'Chị Lan', phone: '0912345678' };

    const res = await service.create(teacher, {
      students: [
        { vietnameseName: 'Nguyễn An', slotId, pricePerSession: 150_000 },
        { vietnameseName: 'Nguyễn Bình', slotId, pricePerSession: 120_000 },
      ],
      effectiveFrom: '2026-10-27',
      parent,
    });

    // Học sinh MANAGED, không email / mật khẩu, ACTIVE ngay
    expect(prisma.user.create).toHaveBeenCalledTimes(2);
    expect(prisma.user.create.mock.calls[0]![0].data).toMatchObject({
      role: 'STUDENT',
      status: 'ACTIVE',
      loginMode: 'MANAGED',
      displayName: 'Nguyễn An',
    });
    expect(prisma.user.create.mock.calls[0]![0].data).not.toHaveProperty('email');
    // Ca + giá kiểm tra một lần cho cùng ca
    expect(enrollment.assertCanEnroll).toHaveBeenCalledTimes(1);
    expect(enrollment.assertCanEnroll).toHaveBeenCalledWith(teacher, slotId, true);
    expect(enrollment.enroll).toHaveBeenCalledWith(prisma, teacher, 's1', {
      slotId,
      effectiveFrom: '2026-10-27',
      pricePerSession: 150_000,
    });
    expect(enrollment.enroll).toHaveBeenCalledWith(prisma, teacher, 's2', {
      slotId,
      effectiveFrom: '2026-10-27',
      pricePerSession: 120_000,
    });
    expect(guardians.linkBillingContactForNew).toHaveBeenCalledExactlyOnceWith(
      prisma,
      ['s1', 's2'],
      parent,
      'Nguyễn An',
    );
    expect(res.items.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(res.affectedSessions).toEqual([
      { sessionId: 'x1', date: '2026-10-27', slotName: 'T3', change: 'ADD', studentId: 's1' },
    ]);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('vào lớp → mở membership + tính lại hạng lớp một lần; ADMIN không bắt buộc lớp / ca', async () => {
    const { prisma, ranking, enrollment, service } = setup();

    await service.create(admin, {
      students: [{ vietnameseName: 'Trần Chi', classId }, { vietnameseName: 'Lê Dũng' }],
    });

    expect(prisma.classMembership.create).toHaveBeenCalledExactlyOnceWith({
      data: { studentId: 's1', classId, joinedAt: expect.any(Date) },
    });
    expect(ranking.recomputeAndNotify).toHaveBeenCalledExactlyOnceWith(prisma, classId);
    expect(enrollment.enroll).not.toHaveBeenCalled();
  });

  it('lớp đã lưu trữ → CLASS_NOT_JOINABLE', async () => {
    const { prisma, service } = setup();
    prisma.class.findUnique.mockResolvedValue({ id: classId, archivedAt: new Date() } as never);

    const err = await service
      .create(admin, { students: [{ vietnameseName: 'Trần Chi', classId }] })
      .catch((e: unknown) => e);

    expect((err as AppError).code).toBe('CLASS_NOT_JOINABLE');
  });
});
