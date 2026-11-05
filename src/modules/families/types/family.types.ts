import { type Prisma } from '@/generated/prisma/client';

const classRefSelect = { id: true, name: true, grade: true, schoolYear: true } as const;

/** Lớp đang học (membership mở) — dựng `StudentClassRef` */
export const activeMembershipSelect = {
  where: { leftAt: null },
  take: 1,
  select: { joinedAt: true, class: { select: classRefSelect } },
} satisfies Prisma.StudentProfile$membershipsArgs;

/** Hồ sơ bé: tên, avatar, trạng thái, lớp đang học / lớp đăng ký */
export const childProfileSelect = {
  userId: true,
  vietnameseName: true,
  englishName: true,
  requestedClassId: true,
  rejectReason: true,
  createdAt: true,
  user: {
    select: { id: true, displayName: true, avatarKey: true, status: true, email: true },
  },
  memberships: activeMembershipSelect,
  requestedClass: { select: classRefSelect },
} satisfies Prisma.StudentProfileSelect;

export type ChildProfileRow = Prisma.StudentProfileGetPayload<{ select: typeof childProfileSelect }>;

/** Phụ huynh + tài khoản gia đình + các con */
export const guardianInclude = {
  user: {
    select: {
      id: true,
      status: true,
      provider: true,
      passwordHash: true,
      googleSub: true,
      lastLoginAt: true,
    },
  },
  students: {
    orderBy: { createdAt: 'asc' },
    include: { student: { select: childProfileSelect } },
  },
} satisfies Prisma.GuardianInclude;

export type GuardianRow = Prisma.GuardianGetPayload<{ include: typeof guardianInclude }>;

/** Phụ huynh không kèm danh sách con (trang chi tiết học sinh) */
export const guardianBaseInclude = { user: guardianInclude.user } satisfies Prisma.GuardianInclude;
export type GuardianBaseRow = Prisma.GuardianGetPayload<{ include: typeof guardianBaseInclude }>;

export const GUARDIAN_SORT_FIELDS = ['fullName', 'email', 'createdAt'] as const;

/** Bé còn chờ duyệt kèm gia đình (đơn) */
export const pendingChildSelect = {
  ...childProfileSelect,
  guardians: {
    select: {
      guardian: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          user: { select: { id: true, status: true, role: true, createdAt: true } },
        },
      },
    },
  },
} satisfies Prisma.StudentProfileSelect;

export type PendingChildRow = Prisma.StudentProfileGetPayload<{ select: typeof pendingChildSelect }>;

/** Thời hạn link mời đặt mật khẩu */
export const INVITE_TTL_HOURS = 72;
