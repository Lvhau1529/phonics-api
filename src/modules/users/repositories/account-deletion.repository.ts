import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';

/** Ai xoá + lúc nào + bản lưu để khôi phục */
export interface SoftDeleteMark {
  at: Date;
  byId: string;
  snapshot: Prisma.InputJsonValue;
}

/**
 * Xoá mềm tài khoản: đánh dấu `deletedAt`, khoá đăng nhập, gỡ liên kết đang hiệu lực (lớp, ca, phụ huynh).
 * Không xoá dữ liệu học tập / điểm danh / học phí — chỉ ẩn khỏi hệ thống.
 */
@Injectable()
export class AccountDeletionRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /** Chỉ tài khoản chưa xoá */
  findUser(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, role: true, email: true, googleSub: true, displayName: true, status: true },
    });
  }

  findGuardian(id: string) {
    return this.prisma.guardian.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        userId: true,
        user: { select: { role: true, email: true, googleSub: true, status: true } },
      },
    });
  }

  /** Liên kết đang hiệu lực của học sinh — sẽ gỡ khi xoá (lưu vào snapshot) */
  async studentLinks(studentId: string, today: string) {
    const [memberships, guardians, assignments] = await Promise.all([
      this.prisma.classMembership.findMany({
        where: { studentId, leftAt: null },
        select: { id: true, classId: true },
      }),
      this.prisma.studentGuardian.findMany({
        where: { studentId },
        select: {
          guardianId: true,
          relation: true,
          isBillingContact: true,
          receivesReports: true,
          canAccess: true,
        },
      }),
      this.prisma.studentSlotAssignment.findMany({
        where: { studentId, OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }] },
        select: { id: true, slotId: true, effectiveFrom: true, effectiveTo: true },
      }),
    ]);
    return { memberships, guardians, assignments };
  }

  async teacherLinks(teacherId: string) {
    const [classes, slots] = await Promise.all([
      this.prisma.classTeacher.findMany({ where: { teacherId }, select: { classId: true } }),
      this.prisma.extraSlotTeacher.findMany({ where: { teacherId }, select: { slotId: true } }),
    ]);
    return { classIds: classes.map((c) => c.classId), slotIds: slots.map((s) => s.slotId) };
  }

  guardianLinks(guardianId: string) {
    return this.prisma.studentGuardian.findMany({
      where: { guardianId },
      select: {
        studentId: true,
        relation: true,
        isBillingContact: true,
        receivesReports: true,
        canAccess: true,
      },
    });
  }

  /** Học sinh rời lớp, ca học thêm kết thúc từ `today` (ca chưa bắt đầu → khoảng rỗng), gỡ phụ huynh */
  async detachStudent(tx: Tx, studentId: string, at: Date, today: string): Promise<void> {
    await tx.classMembership.updateMany({ where: { studentId, leftAt: null }, data: { leftAt: at } });
    await tx.studentSlotAssignment.updateMany({
      where: {
        studentId,
        effectiveFrom: { lt: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
      },
      data: { effectiveTo: today },
    });
    const future = await tx.studentSlotAssignment.findMany({
      where: {
        studentId,
        effectiveFrom: { gte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
      },
      select: { id: true, effectiveFrom: true },
    });
    for (const a of future) {
      await tx.studentSlotAssignment.update({ where: { id: a.id }, data: { effectiveTo: a.effectiveFrom } });
    }
    await tx.studentGuardian.deleteMany({ where: { studentId } });
  }

  async detachTeacher(tx: Tx, teacherId: string): Promise<void> {
    await tx.classTeacher.deleteMany({ where: { teacherId } });
    await tx.extraSlotTeacher.deleteMany({ where: { teacherId } });
  }

  /** Khoá + giải phóng email / Google (dùng lại được) + vô hiệu mọi phiên */
  async softDeleteUser(tx: Tx, id: string, mark: SoftDeleteMark): Promise<void> {
    await tx.user.update({
      where: { id },
      data: {
        status: 'DISABLED',
        email: null,
        googleSub: null,
        tokenVersion: { increment: 1 },
        deletedAt: mark.at,
        deletedById: mark.byId,
        deletedSnapshot: mark.snapshot,
      },
    });
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: mark.at },
    });
  }

  async softDeleteGuardian(tx: Tx, id: string, mark: SoftDeleteMark): Promise<void> {
    await tx.studentGuardian.deleteMany({ where: { guardianId: id } });
    await tx.guardian.update({
      where: { id },
      data: { email: null, deletedAt: mark.at, deletedById: mark.byId, deletedSnapshot: mark.snapshot },
    });
  }

  /** Phiên hồ sơ bé do phụ huynh mở (`act`): thu hồi refresh token + vô hiệu access token của bé */
  async revokeActorSessions(tx: Tx, actorId: string, at: Date): Promise<void> {
    const sessions = await tx.refreshToken.findMany({
      where: { actorId, revokedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });
    if (sessions.length === 0) return;
    await tx.refreshToken.updateMany({ where: { actorId, revokedAt: null }, data: { revokedAt: at } });
    await tx.user.updateMany({
      where: { id: { in: sessions.map((s) => s.userId) } },
      data: { tokenVersion: { increment: 1 } },
    });
  }
}
