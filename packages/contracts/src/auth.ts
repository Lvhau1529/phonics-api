import { z } from 'zod';
import { Id } from './common/ids.js';
import { PermissionCode } from './permissions.js';
import { AvatarKey, DisplayName, Email, Password, User } from './users.js';

/**
 * Cách nhận refresh token:
 *  - mặc định: cookie httpOnly `pa_rt` (cần game / admin / API cùng site)
 *  - header `X-Refresh-Transport: body`: API trả `refreshToken` trong body, client tự lưu (PWA khác domain)
 */
export const REFRESH_TRANSPORT_HEADER = 'X-Refresh-Transport';
export const RefreshTransport = z.enum(['cookie', 'body']);
export type RefreshTransport = z.infer<typeof RefreshTransport>;
export const REFRESH_COOKIE_NAME = 'pa_rt';

/** Liên hệ phụ huynh (học sinh mẫu giáo: email thường do phụ huynh quản lý) */
export const ParentContact = z.strictObject({
  name: z.string().trim().max(60).optional(),
  email: Email.optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s().]{6,20}$/, 'Số điện thoại không hợp lệ')
    .optional(),
});
export type ParentContact = z.infer<typeof ParentContact>;

/** Học sinh đăng ký: phải chọn lớp (danh sách GET /public/classes) */
export const RegisterBody = z.strictObject({
  email: Email,
  password: Password,
  displayName: DisplayName,
  avatarKey: AvatarKey.optional(),
  classId: Id,
  parent: ParentContact.optional(),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.strictObject({
  email: Email,
  password: z.string().min(1).max(72),
});
export type LoginBody = z.infer<typeof LoginBody>;

/** Profile bắt buộc khi đăng nhập Google lần đầu (server trả 422 PROFILE_REQUIRED nếu thiếu) */
export const GoogleProfile = z.strictObject({
  displayName: DisplayName,
  avatarKey: AvatarKey.optional(),
  classId: Id,
  parent: ParentContact.optional(),
});
export type GoogleProfile = z.infer<typeof GoogleProfile>;

export const GoogleBody = z.strictObject({
  /** ID token từ Google Identity Services */
  idToken: z.string().min(1).max(4096),
  profile: GoogleProfile.optional(),
});
export type GoogleBody = z.infer<typeof GoogleBody>;

export const RefreshBody = z.strictObject({
  /** Chỉ cần khi dùng body transport */
  refreshToken: z.string().min(1).max(512).optional(),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export const LogoutBody = z.strictObject({
  refreshToken: z.string().min(1).max(512).optional(),
  /** Đăng xuất mọi thiết bị (bump tokenVersion) */
  all: z.boolean().optional(),
});
export type LogoutBody = z.infer<typeof LogoutBody>;

export const AuthResponse = z.object({
  accessToken: z.string(),
  /** Chỉ có khi client yêu cầu body transport */
  refreshToken: z.string().optional(),
  /** Giây, để client biết khi nào refresh sớm */
  expiresIn: z.int().positive(),
  user: User,
  /** Google: tài khoản vừa được tạo */
  created: z.boolean().optional(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** Chỉ access token mới (refresh) */
export const RefreshResponse = AuthResponse;
export type RefreshResponse = z.infer<typeof RefreshResponse>;

export const MeResponse = z.object({
  user: User,
  permissions: z.array(PermissionCode),
});
export type MeResponse = z.infer<typeof MeResponse>;
