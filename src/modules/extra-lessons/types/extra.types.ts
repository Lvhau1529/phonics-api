import { type Prisma } from '@/generated/prisma/client';

export const slotRefSelect = {
  id: true,
  name: true,
  weekday: true,
  startTime: true,
  endTime: true,
  archivedAt: true,
} satisfies Prisma.ExtraSlotSelect;

/** Ca + lớp tham khảo + GV */
export const slotInclude = {
  class: { select: { id: true, name: true } },
  teachers: {
    orderBy: { teacher: { displayName: 'asc' } },
    select: { teacher: { select: { id: true, displayName: true, email: true, avatarKey: true } } },
  },
} satisfies Prisma.ExtraSlotInclude;

export type SlotRow = Prisma.ExtraSlotGetPayload<{ include: typeof slotInclude }>;

export const assignmentInclude = {
  slot: { select: slotRefSelect },
} satisfies Prisma.StudentSlotAssignmentInclude;
export type AssignmentRow = Prisma.StudentSlotAssignmentGetPayload<{ include: typeof assignmentInclude }>;

export const rateInclude = {
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.ExtraRateInclude;
export type RateRowWithAuthor = Prisma.ExtraRateGetPayload<{ include: typeof rateInclude }>;

/** Học sinh của ca tại một ngày: dòng lịch + tên / avatar / lớp chính */
export const slotStudentInclude = {
  student: {
    select: {
      vietnameseName: true,
      englishName: true,
      user: { select: { displayName: true, avatarKey: true } },
      memberships: {
        where: { leftAt: null },
        take: 1,
        select: {
          joinedAt: true,
          class: { select: { id: true, name: true, grade: true, schoolYear: true } },
        },
      },
    },
  },
} satisfies Prisma.StudentSlotAssignmentInclude;
export type SlotStudentRow = Prisma.StudentSlotAssignmentGetPayload<{ include: typeof slotStudentInclude }>;

// ---------- Buổi & điểm danh ----------

export const sessionSummaryInclude = {
  slot: { select: slotRefSelect },
  confirmedBy: { select: { id: true, displayName: true } },
  _count: { select: { records: true } },
} satisfies Prisma.AttendanceSessionInclude;
export type SessionSummaryRow = Prisma.AttendanceSessionGetPayload<{ include: typeof sessionSummaryInclude }>;

export const recordInclude = {
  student: {
    select: {
      vietnameseName: true,
      englishName: true,
      nameSortKey: true,
      user: { select: { displayName: true, avatarKey: true } },
    },
  },
} satisfies Prisma.AttendanceRecordInclude;
export type RecordRow = Prisma.AttendanceRecordGetPayload<{ include: typeof recordInclude }>;

export const sessionDetailInclude = {
  ...sessionSummaryInclude,
  records: { include: recordInclude, orderBy: { student: { nameSortKey: 'asc' } } },
} satisfies Prisma.AttendanceSessionInclude;
export type SessionDetailRow = Prisma.AttendanceSessionGetPayload<{ include: typeof sessionDetailInclude }>;

export type TeacherRow = { id: string; displayName: string; email: string | null; avatarKey: string };

/** Một buổi trong mail 21:00 lúc gửi */
export interface DigestItem {
  sessionId: string;
  recordsVersion: number;
}
