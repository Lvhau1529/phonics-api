import { z } from 'zod';
import { IsoDateTime } from './common/dates';
import { Id } from './common/ids';

export const Role = z.enum(['ADMIN', 'TEACHER', 'STUDENT']);
export type Role = z.infer<typeof Role>;

export const UserStatus = z.enum(['ACTIVE', 'DISABLED']);
export type UserStatus = z.infer<typeof UserStatus>;

export const AuthProvider = z.enum(['LOCAL', 'GOOGLE']);
export type AuthProvider = z.infer<typeof AuthProvider>;

/**
 * Avatar là bộ preset (không upload): key → ảnh có sẵn trong app game (platform/account/avatars.ts).
 * Thêm avatar = thêm vào AvatarKey + AVATARS + map ảnh ở client.
 */
export const AvatarKey = z.enum(['pip', 'lion', 'tiger', 'panda', 'bunny', 'girl', 'boy']);
export type AvatarKey = z.infer<typeof AvatarKey>;
export const AVATARS: readonly { key: AvatarKey; label: string }[] = [
  { key: 'pip', label: 'Pip' },
  { key: 'lion', label: 'Lion' },
  { key: 'tiger', label: 'Tiger' },
  { key: 'panda', label: 'Panda' },
  { key: 'bunny', label: 'Bunny' },
  { key: 'girl', label: 'Girl' },
  { key: 'boy', label: 'Boy' },
];
export const DEFAULT_AVATAR: AvatarKey = 'pip';

export const DisplayName = z.string().trim().min(1).max(30);
export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const Password = z.string().min(6).max(72);

/** Thông tin lớp hiện tại của học sinh (gắn trong user) */
export const StudentClassRef = z.object({
  id: Id,
  name: z.string(),
  grade: z.string(),
  schoolYear: z.string(),
  joinedAt: IsoDateTime,
});
export type StudentClassRef = z.infer<typeof StudentClassRef>;

/** User trả về cho chính người đó và cho admin (không có hash, token) */
export const User = z.object({
  id: Id,
  email: Email,
  role: Role,
  status: UserStatus,
  provider: AuthProvider,
  displayName: DisplayName,
  avatarKey: AvatarKey,
  /** Chỉ có với STUDENT, null khi chưa vào lớp */
  class: StudentClassRef.nullable(),
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof User>;

/** Học sinh tự sửa: tên, avatar, email (đổi lớp phải nhờ GV / admin) */
export const UpdateProfileBody = z
  .strictObject({ displayName: DisplayName, avatarKey: AvatarKey, email: Email })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Cần ít nhất một trường' });
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

export const ChangePasswordBody = z.strictObject({
  /** Bỏ trống khi tài khoản Google chưa có mật khẩu */
  currentPassword: z.string().optional(),
  newPassword: Password,
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>;
