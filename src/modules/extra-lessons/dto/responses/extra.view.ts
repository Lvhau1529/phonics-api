/** Dựng view ca / lịch / đơn giá (shape contracts) từ dòng Prisma — hàm thuần */
import {
  type AppliedRate,
  AvatarKey,
  DEFAULT_AVATAR,
  type ExtraRate,
  type ExtraSlot,
  type ExtraSlotRef,
  type SlotAssignment,
  type SlotStudent,
} from '@phonics/contracts';
import {
  type AssignmentRow,
  type RateRowWithAuthor,
  type SlotRow,
  type SlotStudentRow,
} from '@/modules/extra-lessons/types/extra.types';

const avatarOf = (key: string) => AvatarKey.safeParse(key).data ?? DEFAULT_AVATAR;

export function toSlotRef(row: AssignmentRow['slot']): ExtraSlotRef {
  return {
    id: row.id,
    name: row.name,
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export function toExtraSlot(row: SlotRow, studentCount: number, defaultPrice: number | null): ExtraSlot {
  return {
    ...toSlotRef(row),
    room: row.room,
    capacity: row.capacity,
    class: row.class,
    teachers: row.teachers.map(({ teacher }) => ({
      id: teacher.id,
      displayName: teacher.displayName,
      // Giáo viên luôn có email (chỉ học sinh MANAGED mới null)
      email: teacher.email ?? '',
      avatarKey: avatarOf(teacher.avatarKey),
    })),
    studentCount,
    defaultPrice,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSlotAssignment(row: AssignmentRow): SlotAssignment {
  return {
    id: row.id,
    studentId: row.studentId,
    slot: toSlotRef(row.slot),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toExtraRate(row: RateRowWithAuthor): ExtraRate {
  return {
    id: row.id,
    studentId: row.studentId,
    slotId: row.slotId,
    pricePerSession: row.pricePerSession,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSlotStudent(row: SlotStudentRow, rate: AppliedRate | null): SlotStudent {
  const membership = row.student.memberships[0];
  return {
    studentId: row.studentId,
    displayName: row.student.user.displayName,
    vietnameseName: row.student.vietnameseName,
    englishName: row.student.englishName,
    avatarKey: avatarOf(row.student.user.avatarKey),
    class: membership ? { ...membership.class, joinedAt: membership.joinedAt.toISOString() } : null,
    assignmentId: row.id,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    rate,
  };
}
