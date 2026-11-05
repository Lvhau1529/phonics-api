import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { ValidationMessage } from './common/validation-messages.js';
import { isValidPhone } from './common/phone.js';

/** PARENT: tài khoản gia đình (phụ huynh giữ đăng nhập, vào hồ sơ từng bé) */
export const Role = z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']);
export type Role = z.infer<typeof Role>;

/** PENDING: tự đăng ký, chờ GV / admin duyệt; REJECTED: bị từ chối */
export const UserStatus = z.enum(['ACTIVE', 'DISABLED', 'PENDING', 'REJECTED']);
export type UserStatus = z.infer<typeof UserStatus>;

/** OWN: tự đăng nhập (email / Google); MANAGED: học sinh chỉ vào qua tài khoản gia đình (không email, không mật khẩu) */
export const LoginMode = z.enum(['OWN', 'MANAGED']);
export type LoginMode = z.infer<typeof LoginMode>;

export const AuthProvider = z.enum(['LOCAL', 'GOOGLE']);
export type AuthProvider = z.infer<typeof AuthProvider>;

/** Cách đăng nhập đang dùng được của tài khoản (một tài khoản có thể có cả mật khẩu lẫn Google) — từ 1.14.0 */
export const LoginMethods = z.object({
  password: z.boolean(),
  google: z.boolean(),
});
export type LoginMethods = z.infer<typeof LoginMethods>;

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
/**
 * Số điện thoại nhập tay (`0912 345 678`, `+84 912…`, đầu số cũ `0166…`): phải là di động / cố định Việt Nam hoặc số
 * quốc tế hợp lệ sau khi chuẩn hoá (`isValidPhone`). Server lưu dạng E.164 (`normalizePhone`).
 */
export const Phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s().]{6,20}$/, ValidationMessage.phoneInvalid)
  .refine(isValidPhone, ValidationMessage.phoneInvalid);

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
  /** null với học sinh MANAGED (vào qua tài khoản gia đình) */
  email: Email.nullable(),
  role: Role,
  status: UserStatus,
  /** Cách tạo tài khoản; cách đăng nhập hiện có xem `loginMethods` */
  provider: AuthProvider,
  displayName: DisplayName,
  avatarKey: AvatarKey,
  /** Chỉ có với STUDENT, null khi chưa vào lớp */
  class: StudentClassRef.nullable(),
  createdAt: IsoDateTime,
  /** Từ 1.7.0 */
  loginMode: LoginMode.optional(),
  /** Từ 1.14.0 */
  loginMethods: LoginMethods.optional(),
});
export type User = z.infer<typeof User>;

/** Học sinh tự sửa: tên, avatar, email (đổi lớp phải nhờ GV / admin) */
export const UpdateProfileBody = z
  .strictObject({ displayName: DisplayName, avatarKey: AvatarKey, email: Email })
  .partial()
  .refine((b) => Object.keys(b).length > 0, ValidationMessage.atLeastOneField);
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

export const ChangePasswordBody = z.strictObject({
  /** Bỏ trống khi tài khoản Google chưa có mật khẩu */
  currentPassword: z.string().optional(),
  newPassword: Password,
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>;
