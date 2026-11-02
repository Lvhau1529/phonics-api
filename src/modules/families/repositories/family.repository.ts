import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { type Prisma } from '@/generated/prisma/client';
import {
  childProfileSelect,
  type ChildProfileRow,
  pendingChildSelect,
  type PendingChildRow,
} from '@/modules/families/types/family.types';

type Db = Tx | PrismaService;

/** Truy vấn tài khoản gia đình: đăng ký, hồ sơ bé, đơn chờ duyệt, token mời */
@Injectable()
export class FamilyRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  findUserByEmailOrGoogle(email: string, googleSub?: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(googleSub ? [{ googleSub }] : [])] },
      select: { id: true },
    });
  }

  /** Lớp nhận học sinh tự đăng ký (hiện ở form đăng ký, chưa lưu trữ) */
  findJoinableClasses(ids: readonly string[], db: Db = this.prisma) {
    return db.class.findMany({
      where: { id: { in: [...ids] }, joinVisible: true, archivedAt: null },
      select: { id: true },
    });
  }

  findClasses(ids: readonly string[]) {
    return this.prisma.class.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, archivedAt: true },
    });
  }

  createUser(tx: Tx, data: Prisma.UserCreateInput) {
    return tx.user.create({ data, select: { id: true } });
  }

  createGuardian(tx: Tx, data: Prisma.GuardianUncheckedCreateInput) {
    return tx.guardian.create({ data, select: { id: true } });
  }

  isGuardianEmailTaken(email: string, db: Db = this.prisma): Promise<boolean> {
    return db.guardian.findFirst({ where: { email }, select: { id: true } }).then((r) => !!r);
  }

  /** Phụ huynh của tài khoản PARENT */
  findGuardianOfUser(userId: string) {
    return this.prisma.guardian.findUnique({
      where: { userId },
      select: { id: true, fullName: true, email: true, phone: true },
    });
  }

  updateGuardian(id: string, data: Prisma.GuardianUpdateInput) {
    return this.prisma.guardian.update({
      where: { id },
      data,
      select: { id: true, fullName: true, email: true, phone: true },
    });
  }

  /** Các bé phụ huynh được vào (`can_access`) */
  async accessibleChildren(guardianId: string): Promise<ChildProfileRow[]> {
    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, canAccess: true },
      orderBy: { createdAt: 'asc' },
      select: { student: { select: childProfileSelect } },
    });
    return links.map((l) => l.student);
  }

  countChildren(guardianId: string): Promise<number> {
    return this.prisma.studentGuardian.count({ where: { guardianId } });
  }

  /** Liên kết phụ huynh (theo user PARENT) ↔ bé */
  findAccessLink(parentUserId: string, studentId: string) {
    return this.prisma.studentGuardian.findFirst({
      where: { studentId, guardian: { userId: parentUserId } },
      select: { canAccess: true, student: { select: childProfileSelect } },
    });
  }

  async updateUser(id: string, data: Prisma.UserUpdateInput): Promise<void> {
    await this.prisma.user.update({ where: { id }, data });
  }

  findChild(studentId: string): Promise<ChildProfileRow | null> {
    return this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: childProfileSelect,
    });
  }

  async deleteUser(id: string, db: Db = this.prisma): Promise<void> {
    await db.user.delete({ where: { id } });
  }

  // ---------- Duyệt tài khoản ----------

  /** Bé chờ duyệt (lọc theo lớp đăng ký khi có `classIds`) kèm phụ huynh */
  pendingChildren(classIds?: readonly string[]): Promise<PendingChildRow[]> {
    return this.prisma.studentProfile.findMany({
      where: {
        user: { role: 'STUDENT', status: 'PENDING' },
        requestedClassId: classIds ? { in: [...classIds] } : undefined,
      },
      orderBy: { createdAt: 'asc' },
      select: pendingChildSelect,
    });
  }

  countPendingChildren(classIds?: readonly string[]): Promise<number> {
    return this.prisma.studentProfile.count({
      where: {
        user: { role: 'STUDENT', status: 'PENDING' },
        requestedClassId: classIds ? { in: [...classIds] } : undefined,
      },
    });
  }

  findPendingChildren(studentIds: readonly string[]): Promise<PendingChildRow[]> {
    return this.prisma.studentProfile.findMany({
      where: { userId: { in: [...studentIds] } },
      select: pendingChildSelect,
    });
  }

  /** Mọi bé của các phụ huynh (để biết bé còn chờ / đã duyệt của một gia đình) */
  childrenOfGuardians(guardianIds: readonly string[]) {
    return this.prisma.studentGuardian.findMany({
      where: { guardianId: { in: [...guardianIds] } },
      select: {
        guardianId: true,
        studentId: true,
        student: { select: { user: { select: { status: true } } } },
      },
    });
  }

  /** Bé chuyển PENDING → trạng thái mới; số dòng đổi < số bé = có người xử lý trước */
  async reviewChildren(
    tx: Tx,
    studentIds: readonly string[],
    status: 'ACTIVE' | 'REJECTED',
    review: { reviewedById: string; reviewedAt: Date; rejectReason?: string },
  ): Promise<number> {
    const { count } = await tx.user.updateMany({
      where: { id: { in: [...studentIds] }, status: 'PENDING' },
      data: { status },
    });
    await tx.studentProfile.updateMany({
      where: { userId: { in: [...studentIds] } },
      data: {
        reviewedById: review.reviewedById,
        reviewedAt: review.reviewedAt,
        rejectReason: review.rejectReason ?? null,
        ...(status === 'ACTIVE' ? { requestedClassId: null } : {}),
      },
    });
    return count;
  }

  async createMembership(tx: Tx, studentId: string, classId: string, joinedAt: Date): Promise<void> {
    await tx.classMembership.create({ data: { studentId, classId, joinedAt } });
  }

  async setUserStatus(
    tx: Tx,
    id: string,
    from: Prisma.EnumUserStatusFilter['in'],
    status: 'ACTIVE' | 'REJECTED',
  ): Promise<void> {
    await tx.user.updateMany({ where: { id, status: { in: from } }, data: { status } });
  }

  findUserStatus(id: string, db: Db = this.prisma) {
    return db.user.findUnique({ where: { id }, select: { status: true, email: true, displayName: true } });
  }

  // ---------- Cảnh báo trùng ----------

  guardiansMatching(where: Prisma.GuardianWhereInput) {
    return this.prisma.guardian.findMany({
      where,
      take: 5,
      select: {
        id: true,
        fullName: true,
        students: { select: { studentId: true } },
      },
    });
  }

  studentsWithSortKeys(sortKeys: readonly string[], exceptIds: readonly string[]) {
    return this.prisma.studentProfile.findMany({
      where: {
        nameSortKey: { in: [...sortKeys] },
        userId: { notIn: [...exceptIds] },
        user: { status: { not: 'REJECTED' } },
      },
      take: 20,
      select: {
        userId: true,
        nameSortKey: true,
        vietnameseName: true,
        englishName: true,
        memberships: {
          where: { leftAt: null },
          take: 1,
          select: { class: { select: { id: true, name: true } } },
        },
      },
    });
  }

  /** Học sinh có lớp đang học trong các lớp này */
  async studentsInClasses(studentIds: readonly string[], classIds: readonly string[]): Promise<Set<string>> {
    if (!studentIds.length || !classIds.length) return new Set();
    const rows = await this.prisma.classMembership.findMany({
      where: { studentId: { in: [...studentIds] }, classId: { in: [...classIds] }, leftAt: null },
      select: { studentId: true },
    });
    return new Set(rows.map((r) => r.studentId));
  }

  // ---------- Gộp đơn ----------

  findGuardianForMerge(id: string) {
    return this.prisma.guardian.findUnique({
      where: { id },
      select: { id: true, userId: true, students: { select: { studentId: true } } },
    });
  }

  linksOfGuardian(guardianId: string) {
    return this.prisma.studentGuardian.findMany({ where: { guardianId } });
  }

  async moveLinks(tx: Tx, links: readonly Prisma.StudentGuardianCreateManyInput[]): Promise<void> {
    await tx.studentGuardian.createMany({ data: [...links], skipDuplicates: true });
  }

  async deleteGuardian(tx: Tx, id: string): Promise<void> {
    await tx.guardian.delete({ where: { id } });
  }

  async attachUser(tx: Tx, guardianId: string, userId: string): Promise<void> {
    await tx.guardian.update({ where: { id: guardianId }, data: { userId } });
  }

  // ---------- Token mời ----------

  findAuthToken(tokenHash: string) {
    return this.prisma.authToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
    });
  }

  /** Đánh dấu đã dùng (một lần) — false nếu đã bị dùng trước */
  async consumeAuthToken(tx: Tx, id: string, at: Date): Promise<boolean> {
    const { count } = await tx.authToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: at } });
    return count === 1;
  }

  async setPassword(tx: Tx, userId: string, passwordHash: string, at: Date): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, emailVerified: true } });
    // Link mời khác của cùng tài khoản hết hiệu lực
    await tx.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: at } });
  }
}
