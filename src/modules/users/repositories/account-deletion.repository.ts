import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';

/** Đếm dữ liệu sẽ mất theo + xoá hẳn tài khoản (FK onDelete Cascade / SetNull lo phần còn lại) */
@Injectable()
export class AccountDeletionRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  findUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, displayName: true, status: true },
    });
  }

  findGuardian(id: string) {
    return this.prisma.guardian.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        userId: true,
        user: { select: { role: true } },
      },
    });
  }

  async studentCounts(studentId: string) {
    const where = { studentId };
    const [
      classes,
      guardians,
      gameResults,
      pointEntries,
      submissions,
      attendance,
      slotAssignments,
      confirmed,
    ] = await Promise.all([
      this.prisma.classMembership.count({ where }),
      this.prisma.studentGuardian.count({ where }),
      this.prisma.gameResult.count({ where }),
      this.prisma.pointEntry.count({ where }),
      this.prisma.submission.count({ where }),
      this.prisma.attendanceRecord.count({ where }),
      this.prisma.studentSlotAssignment.count({ where }),
      this.prisma.attendanceRecord.count({ where: { studentId, session: { status: 'CONFIRMED' } } }),
    ]);
    return {
      impact: { classes, guardians, gameResults, pointEntries, submissions, attendance, slotAssignments },
      confirmed,
    };
  }

  async teacherCounts(teacherId: string) {
    const [classes, extraSlots, comments, questions, worksheets, assignments, media] = await Promise.all([
      this.prisma.classTeacher.count({ where: { teacherId } }),
      this.prisma.extraSlotTeacher.count({ where: { teacherId } }),
      this.prisma.comment.count({ where: { authorId: teacherId } }),
      this.prisma.question.count({ where: { createdById: teacherId } }),
      this.prisma.worksheet.count({ where: { createdById: teacherId } }),
      this.prisma.assignment.count({ where: { assignedById: teacherId } }),
      this.prisma.mediaAsset.count({ where: { ownerId: teacherId } }),
    ]);
    return {
      impact: { classes, extraSlots, comments },
      authored: questions + worksheets + assignments,
      media,
    };
  }

  countChildren(guardianId: string): Promise<number> {
    return this.prisma.studentGuardian.count({ where: { guardianId } });
  }

  deleteUser(tx: Tx, id: string) {
    return tx.user.delete({ where: { id } });
  }

  deleteGuardian(tx: Tx, id: string) {
    return tx.guardian.delete({ where: { id } });
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
