import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type GameResult, type Prisma } from '@/generated/prisma/client';
import { type StudentRow, studentInclude } from '@/modules/students/types/student.types';

/** Mọi truy vấn Prisma về học sinh (users role STUDENT + student_profiles + class_memberships) */
@Injectable()
export class StudentRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /** Người dùng theo id (service kiểm tra role STUDENT) */
  findById(id: string): Promise<StudentRow | null> {
    return this.prisma.user.findUnique({ where: { id }, include: studentInclude });
  }

  findPage(
    where: Prisma.UserWhereInput,
    page: { skip: number; take: number },
    orderBy: Prisma.UserOrderByWithRelationInput[],
  ): Promise<StudentRow[]> {
    return this.prisma.user.findMany({ where, ...page, orderBy, include: studentInclude });
  }

  count(where: Prisma.UserWhereInput): Promise<number> {
    return this.prisma.user.count({ where });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<StudentRow> {
    return this.prisma.user.update({ where: { id }, data, include: studentInclude });
  }

  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async isEmailTaken(email: string, exceptId: string): Promise<boolean> {
    return !!(await this.prisma.user.findFirst({
      where: { email, NOT: { id: exceptId } },
      select: { id: true },
    }));
  }

  findClass(id: string) {
    return this.prisma.class.findUnique({
      where: { id },
      select: { id: true, name: true, grade: true, archivedAt: true },
    });
  }

  /** Đóng membership đang mở và mở membership mới (trong transaction) */
  async moveMembership(tx: Tx, studentId: string, classId: string, at: Date): Promise<void> {
    await tx.classMembership.updateMany({ where: { studentId, leftAt: null }, data: { leftAt: at } });
    await tx.classMembership.create({ data: { studentId, classId, joinedAt: at } });
  }

  /** Tổng điểm mọi lúc theo học sinh (một groupBy cho cả trang) */
  async totalPoints(studentIds: readonly string[]): Promise<Map<string, number>> {
    const sums = await this.prisma.pointEntry.groupBy({
      by: ['studentId'],
      where: { studentId: { in: [...studentIds] } },
      _sum: { points: true },
    });
    return new Map(sums.map((s) => [s.studentId, s._sum.points ?? 0]));
  }

  countGameResults(where: Prisma.GameResultWhereInput): Promise<number> {
    return this.prisma.gameResult.count({ where });
  }

  findGameResults(
    where: Prisma.GameResultWhereInput,
    page: { skip: number; take: number },
    orderBy: Prisma.GameResultOrderByWithRelationInput[],
  ): Promise<GameResult[]> {
    return this.prisma.gameResult.findMany({ where, ...page, orderBy });
  }
}
