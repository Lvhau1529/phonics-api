import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';

export const Role = z.enum(['ADMIN', 'TEACHER', 'STUDENT']);
export type Role = z.infer<typeof Role>;

export const UserStatus = z.enum(['ACTIVE', 'DISABLED']);
export type UserStatus = z.infer<typeof UserStatus>;

export const AuthProvider = z.enum(['LOCAL', 'GOOGLE']);
export type AuthProvider = z.infer<typeof AuthProvider>;

/**
 * Avatar là bộ preset (không upload): key → ảnh có sẵn trong app game (platform/account/avatars.ts).
 * Thêm avatar = thêm vào AvatarKey + AVATARS + map ảnh ở client.
 *
 * `pip`, `girl`, `boy`: avatar cũ — vẫn hợp lệ (tài khoản đã chọn giữ nguyên, DB default `pip`) nhưng không còn
 * trong AVATARS nên không chọn mới được.
 */
export const AvatarKey = z.enum([
  'tiger',
  'elephant',
  'lion',
  'monkey',
  'dog',
  'cat',
  'panda',
  'bunny',
  'pip',
  'girl',
  'boy',
]);
export type AvatarKey = z.infer<typeof AvatarKey>;
/** Avatar chọn được (picker của game / admin) — 8 con vật của Animal Avatar sheet, theo thứ tự trên sheet */
export const AVATARS: readonly { key: AvatarKey; label: string }[] = [
  { key: 'tiger', label: 'Tiger' },
  { key: 'elephant', label: 'Elephant' },
  { key: 'lion', label: 'Lion' },
  { key: 'monkey', label: 'Monkey' },
  { key: 'dog', label: 'Dog' },
  { key: 'cat', label: 'Cat' },
  { key: 'panda', label: 'Panda' },
  { key: 'bunny', label: 'Bunny' },
];
export const DEFAULT_AVATAR: AvatarKey = 'bunny';

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
