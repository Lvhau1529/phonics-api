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
