/** Luật thuần khi sửa học sinh: quyền theo vai trò, dữ liệu profile, before / after cho audit */
import { type UpdateStudentBody } from '@phonics/contracts';
import { AppError } from '../../../common/errors/app-error';
import { type Prisma } from '../../../generated/prisma/client';
import { type AuthUser } from '../../auth/types/auth.types';
import { toParentContact } from '../dto/responses/student.view';
import { type StudentRow } from '../types/student.types';

/** Trường giáo viên (có students.edit) được sửa; còn lại chỉ admin */
export const TEACHER_EDITABLE_FIELDS: readonly (keyof UpdateStudentBody)[] = ['displayName', 'avatarKey'];

/** TEACHER chỉ được sửa displayName / avatarKey */
export function assertCanEditFields(actor: AuthUser, body: UpdateStudentBody): void {
  if (actor.role === 'ADMIN') return;
  const keys = (Object.keys(body) as (keyof UpdateStudentBody)[]).filter((k) => body[k] !== undefined);
  const denied = keys.filter((k) => !TEACHER_EDITABLE_FIELDS.includes(k));
  if (denied.length) {
    throw new AppError('FORBIDDEN_PERMISSION', 403, {
      message: 'Giáo viên chỉ được sửa tên hiển thị và avatar',
      details: { fields: denied.map(String) },
    });
  }
}

/** Dữ liệu profile cần ghi (phụ huynh / ghi chú); rỗng = không đụng profile */
export function profileUpdateOf(body: UpdateStudentBody): Prisma.StudentProfileUpdateInput {
  const data: Prisma.StudentProfileUpdateInput = {};
  if (body.parent !== undefined) {
    data.parentName = body.parent?.name ?? null;
    data.parentEmail = body.parent?.email ?? null;
    data.parentPhone = body.parent?.phone ?? null;
  }
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
  for (const key of ['displayName', 'avatarKey', 'email', 'status'] as const) {
    if (body[key] !== undefined && body[key] !== current[key]) {
      before[key] = current[key];
      after[key] = updated[key];
    }
  }
  if (body.parent !== undefined) {
    before.parent = toParentContact(current.studentProfile);
    after.parent = toParentContact(updated.studentProfile);
  }
  if (body.notes !== undefined && body.notes !== (current.studentProfile?.notes ?? null)) {
    before.notes = current.studentProfile?.notes ?? null;
    after.notes = updated.studentProfile?.notes ?? null;
  }
  return { before, after };
}
