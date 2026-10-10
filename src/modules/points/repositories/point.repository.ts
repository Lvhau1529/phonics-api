import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { type Tx } from '../../../database/types';
import { type Prisma } from '../../../generated/prisma/client';
import { type BonusEntryInput, pointEntryInclude, type PointEntryRow } from '../types/point.types';

/** Truy cập bảng point_entries (+ tra cứu lớp / thành viên mà luật điểm cần) */
@Injectable()
export class PointRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  sumByKind(where: Prisma.PointEntryWhereInput, tx: Tx = this.prisma) {
    return tx.pointEntry.groupBy({ by: ['kind'], where, _sum: { points: true } });
  }

  sumByGame(where: Prisma.PointEntryWhereInput, tx: Tx = this.prisma) {
    return tx.pointEntry.groupBy({
      by: ['gameId'],
      where: { ...where, gameId: { not: null } },
      _sum: { points: true },
      _count: { _all: true },
    });
  }

  findPage(
    where: Prisma.PointEntryWhereInput,
    args: { skip: number; take: number },
  ): Promise<PointEntryRow[]> {
    return this.prisma.pointEntry.findMany({
      where,
      ...args,
      orderBy: { createdAt: 'desc' },
      include: pointEntryInclude,
    });
  }

  count(where: Prisma.PointEntryWhereInput): Promise<number> {
    return this.prisma.pointEntry.count({ where });
  }

  createBonus(tx: Tx, input: BonusEntryInput): Promise<PointEntryRow> {
    return tx.pointEntry.create({
      data: { ...input, kind: 'BONUS' },
      include: pointEntryInclude,
    });
  }

  async className(classId: string): Promise<string | null> {
    const row = await this.prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
    return row?.name ?? null;
  }

  /** Lớp hiện tại của học sinh (null nếu chưa thuộc lớp nào) */
  async currentClassId(studentId: string): Promise<string | null> {
    const row = await this.prisma.classMembership.findFirst({
      where: { studentId, leftAt: null },
      select: { classId: true },
    });
    return row?.classId ?? null;
  }

  /** Các học sinh (trong danh sách) đang là thành viên lớp */
  async activeMemberIds(classId: string, studentIds: readonly string[]): Promise<Set<string>> {
    const rows = await this.prisma.classMembership.findMany({
      where: { classId, leftAt: null, studentId: { in: [...studentIds] } },
      select: { studentId: true },
    });
    return new Set(rows.map((m) => m.studentId));
  }

  async displayName(tx: Tx, userId: string): Promise<string | null> {
    const row = await tx.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return row?.displayName ?? null;
  }
}
