import { z } from 'zod';
import { ParentContact } from './auth.js';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { ValidationMessage } from './common/validation-messages.js';
import { AvatarKey, DisplayName, Email, Password, StudentClassRef, UserStatus } from './users.js';

/** Họ tên tiếng Việt của học sinh (bắt buộc) — dùng ở phiếu học phí, mail phụ huynh */
export const VietnameseName = DisplayName;
/** Tên tiếng Anh (tuỳ chọn) — có thì là tên hiển thị trong game / xếp hạng */
export const EnglishName = DisplayName;

export const StudentSummary = z.object({
  id: Id,
  email: Email,
  /** Tên hiển thị = tên tiếng Anh nếu có, không thì tên tiếng Việt (server tự đồng bộ) */
  displayName: DisplayName,
  vietnameseName: VietnameseName,
  englishName: EnglishName.nullable(),
  avatarKey: AvatarKey,
  status: UserStatus,
  class: StudentClassRef.nullable(),
  /** Tổng điểm mọi thời gian */
  points: z.int(),
  /** Hạng trong lớp (null khi chưa có lớp) */
  rank: z.int().min(1).nullable(),
  lastLoginAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type StudentSummary = z.infer<typeof StudentSummary>;

export const StudentDetail = StudentSummary.extend({
  /** Chỉ admin hoặc GV có quyền students.viewParentContact; người khác nhận null */
  parent: ParentContact.nullable(),
  /** Ghi chú nội bộ của admin */
  notes: z.string().nullable(),
  pointsByKind: z.object({ GAME: z.int(), BONUS: z.int() }),
  gamesPlayed: z.int().min(0),
});
export type StudentDetail = z.infer<typeof StudentDetail>;

export const StudentListQuery = PageQuery.extend({
  classId: Id.optional(),
  status: UserStatus.optional(),
});
export type StudentListQuery = z.infer<typeof StudentListQuery>;

/**
 * Admin: mọi trường; GV có students.edit: chỉ tên / avatarKey.
 * `englishName: null` = xoá tên tiếng Anh. `displayName` (client cũ, < 1.6.0) sửa tên **đang hiển thị** (tên tiếng
 * Anh nếu có, không thì tên tiếng Việt); bị bỏ qua khi có `vietnameseName` / `englishName`.
 */
export const UpdateStudentBody = z
  .strictObject({
    vietnameseName: VietnameseName,
    englishName: EnglishName.nullable(),
    /** @deprecated dùng `vietnameseName` / `englishName` */
    displayName: DisplayName,
    avatarKey: AvatarKey,
    email: Email,
    status: UserStatus,
    parent: ParentContact.nullable(),
    notes: z.string().trim().max(1000).nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField);
export type UpdateStudentBody = z.infer<typeof UpdateStudentBody>;

export const MoveClassBody = z.strictObject({
  classId: Id,
  note: z.string().trim().max(200).optional(),
});
export type MoveClassBody = z.infer<typeof MoveClassBody>;

export const ResetPasswordBody = z.strictObject({ newPassword: Password });
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;

/** Họ tên đầy đủ: `Nguyễn Văn An (Andy)`, hoặc `Nguyễn Văn An` khi không có tên tiếng Anh */
export function studentFullName(s: { vietnameseName: string; englishName: string | null }): string {
  return s.englishName ? `${s.vietnameseName} (${s.englishName})` : s.vietnameseName;
}
