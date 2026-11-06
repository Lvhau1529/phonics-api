/** Luật thuần khi sửa học sinh: quyền theo vai trò, dữ liệu profile, before / after cho audit */
import { type UpdateStudentBody } from '@phonics/contracts';
import { AppError } from '@/common/errors/app-error';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { type StudentRow } from '@/modules/students/types/student.types';
import { type StudentNames } from '@/common/utils/student-names';

/** Trường giáo viên (có students.edit) được sửa; còn lại chỉ admin */
export const TEACHER_EDITABLE_FIELDS: readonly (keyof UpdateStudentBody)[] = [
  'vietnameseName',
  'englishName',
  'avatarKey',
];

/** TEACHER chỉ được sửa tên / avatarKey */
export function assertCanEditFields(actor: AuthUser, body: UpdateStudentBody): void {
  if (actor.role === 'ADMIN') return;
  const keys = (Object.keys(body) as (keyof UpdateStudentBody)[]).filter((k) => body[k] !== undefined);
  const denied = keys.filter((k) => !TEACHER_EDITABLE_FIELDS.includes(k));
  if (denied.length) {
    throw new AppError('FORBIDDEN_PERMISSION', 403, {
      message: 'teacherFieldsOnly',
      details: { fields: denied.map(String) },
    });
  }
}

/** Bộ tên hiện tại; thiếu profile (dữ liệu hỏng) → tên hiển thị là tên tiếng Việt */
export function studentNamesOf(row: StudentRow): StudentNames {
  return {
    vietnameseName: row.studentProfile?.vietnameseName ?? row.displayName,
    englishName: row.studentProfile?.englishName ?? null,
  };
}

/** Dữ liệu profile cần ghi (ghi chú); rỗng = không đụng profile */
export function profileUpdateOf(body: UpdateStudentBody): Prisma.StudentProfileUpdateInput {
  const data: Prisma.StudentProfileUpdateInput = {};
  if (body.notes !== undefined) data.notes = body.notes;
  return data;
}

/** Chỉ các trường thực sự đổi (before / after) để ghi audit */
export function studentAuditDiff(
  body: UpdateStudentBody,
  current: StudentRow,
  updated: StudentRow,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of ['avatarKey', 'status'] as const) {
    if (body[key] !== undefined && body[key] !== current[key]) {
      before[key] = current[key];
      after[key] = updated[key];
    }
  }
  for (const key of ['vietnameseName', 'englishName'] as const) {
    const was = current.studentProfile?.[key] ?? null;
    const now = updated.studentProfile?.[key] ?? null;
    if (was !== now) {
      before[key] = was;
      after[key] = now;
    }
  }
  if (body.notes !== undefined && body.notes !== (current.studentProfile?.notes ?? null)) {
    before.notes = current.studentProfile?.notes ?? null;
    after.notes = updated.studentProfile?.notes ?? null;
  }
  return { before, after };
}
