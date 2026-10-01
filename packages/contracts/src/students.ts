import { z } from 'zod';
import { ParentContact } from './auth';
import { IsoDateTime } from './common/dates';
import { Id } from './common/ids';
import { PageQuery } from './common/pagination';
import { AvatarKey, DisplayName, Email, Password, StudentClassRef, UserStatus } from './users';

export const StudentSummary = z.object({
  id: Id,
  email: Email,
  displayName: DisplayName,
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

/** Admin: mọi trường; GV có students.edit: chỉ displayName / avatarKey */
export const UpdateStudentBody = z
  .strictObject({
    displayName: DisplayName,
    avatarKey: AvatarKey,
    email: Email,
    status: UserStatus,
    parent: ParentContact.nullable(),
    notes: z.string().trim().max(1000).nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Cần ít nhất một trường' });
export type UpdateStudentBody = z.infer<typeof UpdateStudentBody>;

export const MoveClassBody = z.strictObject({
  classId: Id,
  note: z.string().trim().max(200).optional(),
});
export type MoveClassBody = z.infer<typeof MoveClassBody>;

export const ResetPasswordBody = z.strictObject({ newPassword: Password });
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;
