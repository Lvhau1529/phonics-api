/** Dựng view phụ huynh / hồ sơ bé (shape contracts) từ dòng Prisma — hàm thuần */
import {
  AvatarKey,
  DEFAULT_AVATAR,
  type FamilyProfile,
  type Guardian,
  type GuardianAccount,
  type GuardianChild,
  type GuardianSummary,
  type MyGuardian,
  type PendingChild,
  type StudentClassRef,
  type StudentGuardianView,
} from '@phonics/contracts';
import { type StudentGuardian } from '@/generated/prisma/client';
import {
  type ChildProfileRow,
  type GuardianBaseRow,
  type GuardianRow,
} from '@/modules/families/types/family.types';

function avatarOf(key: string): AvatarKey {
  return AvatarKey.safeParse(key).data ?? DEFAULT_AVATAR;
}

export function toClassRef(row: Pick<ChildProfileRow, 'memberships'>): StudentClassRef | null {
  const m = row.memberships[0];
  return m ? { ...m.class, joinedAt: m.joinedAt.toISOString() } : null;
}

export function toFamilyProfile(row: ChildProfileRow): FamilyProfile {
  return {
    id: row.userId,
    displayName: row.user.displayName,
    vietnameseName: row.vietnameseName,
    englishName: row.englishName,
    avatarKey: avatarOf(row.user.avatarKey),
    status: row.user.status,
    class: toClassRef(row),
    requestedClass: row.requestedClass,
    rejectReason: row.user.status === 'REJECTED' ? row.rejectReason : null,
  };
}

export function toPendingChild(row: ChildProfileRow): PendingChild {
  return {
    studentId: row.userId,
    displayName: row.user.displayName,
    vietnameseName: row.vietnameseName,
    englishName: row.englishName,
    avatarKey: avatarOf(row.user.avatarKey),
    requestedClass: row.requestedClass,
    createdAt: row.createdAt.toISOString(),
  };
}

function toGuardianAccount(user: GuardianBaseRow['user']): GuardianAccount | null {
  if (!user) return null;
  return {
    userId: user.id,
    status: user.status,
    provider: user.provider,
    hasCredentials: !!user.passwordHash || !!user.googleSub,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export function toGuardian(row: GuardianBaseRow): Guardian {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    note: row.note,
    account: toGuardianAccount(row.user),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type LinkFlags = Pick<StudentGuardian, 'relation' | 'isBillingContact' | 'receivesReports' | 'canAccess'>;

function flagsOf(link: LinkFlags): LinkFlags {
  return {
    relation: link.relation,
    isBillingContact: link.isBillingContact,
    receivesReports: link.receivesReports,
    canAccess: link.canAccess,
  };
}

export function toGuardianSummary(row: GuardianRow): GuardianSummary {
  return {
    ...toGuardian(row),
    children: row.students.map((link): GuardianChild => ({
      ...flagsOf(link),
      studentId: link.studentId,
      displayName: link.student.user.displayName,
      vietnameseName: link.student.vietnameseName,
      englishName: link.student.englishName,
      avatarKey: avatarOf(link.student.user.avatarKey),
      status: link.student.user.status,
      loginMode: link.student.user.loginMode,
      class: toClassRef(link.student),
    })),
  };
}

export function toStudentGuardianView(link: LinkFlags & { guardian: GuardianBaseRow }): StudentGuardianView {
  return { ...flagsOf(link), guardian: toGuardian(link.guardian) };
}

export function toMyGuardian(row: Pick<GuardianBaseRow, 'id' | 'fullName' | 'email' | 'phone'>): MyGuardian {
  return { id: row.id, fullName: row.fullName, email: row.email, phone: row.phone };
}
