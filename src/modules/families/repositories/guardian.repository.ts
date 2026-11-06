import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import {
  guardianBaseInclude,
  guardianInclude,
  type GuardianRow,
} from '@/modules/families/types/family.types';

type Db = Tx | PrismaService;

/** Truy vấn phụ huynh (guardians), liên kết phụ huynh ↔ học sinh và tài khoản gia đình */
@Injectable()
export class GuardianRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  findById(id: string, db: Db = this.prisma): Promise<GuardianRow | null> {
    return db.guardian.findFirst({ where: { id, deletedAt: null }, include: guardianInclude });
  }

  findByUserId(userId: string, db: Db = this.prisma): Promise<GuardianRow | null> {
    return db.guardian.findFirst({ where: { userId, deletedAt: null }, include: guardianInclude });
  }

  findPage(
    where: Prisma.GuardianWhereInput,
    page: { skip: number; take: number },
    orderBy: Prisma.GuardianOrderByWithRelationInput[],
  ): Promise<GuardianRow[]> {
    return this.prisma.guardian.findMany({ where, ...page, orderBy, include: guardianInclude });
  }

  count(where: Prisma.GuardianWhereInput): Promise<number> {
    return this.prisma.guardian.count({ where });
  }

  /** Phụ huynh khác đang dùng email này */
  async isEmailTaken(email: string, exceptId?: string, db: Db = this.prisma): Promise<boolean> {
    return !!(await db.guardian.findFirst({
      where: { email, NOT: exceptId ? { id: exceptId } : undefined },
      select: { id: true },
    }));
  }

  findIdByEmail(email: string, db: Db = this.prisma) {
    return db.guardian.findFirst({ where: { email }, select: { id: true } });
  }

  findUserByEmail(email: string, db: Db = this.prisma) {
    return db.user.findUnique({ where: { email }, select: { id: true, role: true } });
  }

  create(data: Prisma.GuardianUncheckedCreateInput, db: Db = this.prisma): Promise<GuardianRow> {
    return db.guardian.create({ data, include: guardianInclude });
  }

  update(id: string, data: Prisma.GuardianUncheckedUpdateInput, db: Db = this.prisma): Promise<GuardianRow> {
    return db.guardian.update({ where: { id }, data, include: guardianInclude });
  }

  async updateUser(id: string, data: Prisma.UserUpdateInput, db: Db = this.prisma): Promise<void> {
    await db.user.update({ where: { id }, data });
  }

  async isStudent(id: string): Promise<boolean> {
    return !!(await this.prisma.user.findFirst({
      where: { id, role: 'STUDENT', deletedAt: null },
      select: { id: true },
    }));
  }

  /** Phụ huynh của một học sinh (người nhận học phí trước) */
  studentLinks(studentId: string, db: Db = this.prisma) {
    return db.studentGuardian.findMany({
      where: { studentId },
      orderBy: [{ isBillingContact: 'desc' }, { createdAt: 'asc' }],
      include: { guardian: { include: guardianBaseInclude } },
    });
  }

  countGuardians(ids: readonly string[]): Promise<number> {
    return this.prisma.guardian.count({ where: { id: { in: [...ids] }, deletedAt: null } });
  }

  /** Thay toàn bộ liên kết của học sinh */
  async replaceStudentLinks(
    tx: Tx,
    studentId: string,
    links: readonly Omit<Prisma.StudentGuardianCreateManyInput, 'studentId'>[],
  ): Promise<void> {
    await tx.studentGuardian.deleteMany({ where: { studentId } });
    if (links.length) await tx.studentGuardian.createMany({ data: links.map((l) => ({ ...l, studentId })) });
  }

  /** Phụ huynh nhận học phí của học sinh (tạo liên kết hoặc bật cờ ở liên kết sẵn có) */
  async upsertBillingLink(tx: Tx, studentId: string, guardianId: string): Promise<void> {
    await tx.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId } },
      create: { studentId, guardianId, isBillingContact: true },
      update: { isBillingContact: true },
    });
  }

  /** Tạo liên kết nếu chưa có (giữ cờ của liên kết sẵn có) */
  async ensureLink(tx: Tx, data: Prisma.StudentGuardianCreateManyInput): Promise<void> {
    await tx.studentGuardian.createMany({ data: [data], skipDuplicates: true });
  }

  async hasBillingContact(tx: Tx, studentId: string): Promise<boolean> {
    return !!(await tx.studentGuardian.findFirst({
      where: { studentId, isBillingContact: true },
      select: { studentId: true },
    }));
  }

  /** Bé thôi được phụ huynh mở hồ sơ: vô hiệu access token + thu hồi phiên do phụ huynh đó mở */
  async revokeActorSessions(tx: Tx, studentId: string, actorId: string, at: Date): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { userId: studentId, actorId, revokedAt: null },
      data: { revokedAt: at },
    });
    await tx.user.update({ where: { id: studentId }, data: { tokenVersion: { increment: 1 } } });
  }

  createParentUser(tx: Tx, data: Omit<Prisma.UserCreateInput, 'role'>) {
    return tx.user.create({ data: { ...data, role: 'PARENT' }, select: { id: true } });
  }

  /** Token một lần (lưu hash) */
  async createAuthToken(
    tx: Tx,
    data: { userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<{ id: string }> {
    return tx.authToken.create({ data: { ...data, purpose: 'INVITE' }, select: { id: true } });
  }
}
