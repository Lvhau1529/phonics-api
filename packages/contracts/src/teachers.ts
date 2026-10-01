import { z } from 'zod';
import { PublicClass } from './classes.js';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { AuthProvider, AvatarKey, DisplayName, Email, Password, UserStatus } from './users.js';

export const TeacherSummary = z.object({
  id: Id,
  email: Email,
  displayName: DisplayName,
  avatarKey: AvatarKey,
  status: UserStatus,
  provider: AuthProvider,
  /** false = chưa đặt mật khẩu (đăng nhập Google) */
  hasPassword: z.boolean(),
  classes: z.array(PublicClass),
  lastLoginAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type TeacherSummary = z.infer<typeof TeacherSummary>;

export const TeacherListQuery = PageQuery.extend({
  classId: Id.optional(),
  status: UserStatus.optional(),
});
export type TeacherListQuery = z.infer<typeof TeacherListQuery>;

/** Không có password → GV đăng nhập bằng Google với email này */
export const CreateTeacherBody = z.strictObject({
  email: Email,
  displayName: DisplayName,
  password: Password.optional(),
  avatarKey: AvatarKey.optional(),
  classIds: z.array(Id).max(50).default([]),
});
export type CreateTeacherBody = z.infer<typeof CreateTeacherBody>;

export const UpdateTeacherBody = z
  .strictObject({
    email: Email,
    displayName: DisplayName,
    avatarKey: AvatarKey,
    status: UserStatus,
    password: Password,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Cần ít nhất một trường' });
export type UpdateTeacherBody = z.infer<typeof UpdateTeacherBody>;

export const SetTeacherClassesBody = z.strictObject({ classIds: z.array(Id).max(50) });
export type SetTeacherClassesBody = z.infer<typeof SetTeacherClassesBody>;
