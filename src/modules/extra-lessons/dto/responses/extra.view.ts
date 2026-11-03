/** Dựng view ca / lịch / đơn giá (shape contracts) từ dòng Prisma — hàm thuần */
import {
  type AppliedRate,
  type AttendanceRecord as AttendanceRecordView,
  type AttendanceSessionSummary,
  AvatarKey,
  DEFAULT_AVATAR,
  type ExtraRate,
  type ExtraSlot,
  type ExtraSlotRef,
  type SlotAssignment,
  type SlotStudent,
  type TeacherRef,
} from '@phonics/contracts';
import {
  type AssignmentRow,
  type RateRowWithAuthor,
  type RecordRow,
  type SessionSummaryRow,
  type SlotRow,
  type SlotStudentRow,
  type TeacherRow,
} from '@/modules/extra-lessons/types/extra.types';

const avatarOf = (key: string) => AvatarKey.safeParse(key).data ?? DEFAULT_AVATAR;

export function toSlotRef(row: AssignmentRow['slot']): ExtraSlotRef {
  return {
    id: row.id,
    name: row.name,
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export function toExtraSlot(
  row: SlotRow,
  studentCount: number,
  defaultPrice: number | null,
  nextSessionDate: string | null,
): ExtraSlot {
  return {
    ...toSlotRef(row),
    room: row.room,
    capacity: row.capacity,
    class: row.class,
    teachers: row.teachers.map(({ teacher }) => toTeacherRef(teacher)),
    studentCount,
    defaultPrice,
    nextSessionDate,
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

// ---------- Buổi & điểm danh ----------

export function toTeacherRef(row: TeacherRow): TeacherRef {
  // Giáo viên luôn có email (chỉ học sinh MANAGED mới null)
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email ?? '',
    avatarKey: avatarOf(row.avatarKey),
  };
}

export function toSessionSummary(
  row: SessionSummaryRow,
  teachers: ReadonlyMap<string, TeacherRow>,
  missingRateCount: number,
): AttendanceSessionSummary {
  return {
    id: row.id,
    slot: row.slot ? toSlotRef(row.slot) : null,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    teachers: row.teacherIds.flatMap((id) => {
      const t = teachers.get(id);
      return t ? [toTeacherRef(t)] : [];
    }),
    status: row.status,
    studentCount: row._count.records,
    presentCount: row.presentCount,
    recordsVersion: row.recordsVersion,
    missingRateCount,
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmedVia: row.confirmedVia === 'EMAIL' || row.confirmedVia === 'APP' ? row.confirmedVia : null,
    cancelReason: row.cancelReason,
    note: row.note,
  };
}

export function toAttendanceRecord(row: RecordRow, showPrice: boolean): AttendanceRecordView {
  return {
    studentId: row.studentId,
    displayName: row.student.user.displayName,
    vietnameseName: row.student.vietnameseName,
    englishName: row.student.englishName,
    avatarKey: avatarOf(row.student.user.avatarKey),
    mark: row.mark,
    charged: row.charged,
    unitPrice: showPrice ? row.unitPrice : null,
    missingRate: row.rateId === null,
    source: row.source === 'MANUAL' ? 'MANUAL' : 'SNAPSHOT',
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}
