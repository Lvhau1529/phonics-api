import { z } from 'zod';
import { Id } from './common/ids.js';
import { PermissionCode } from './permissions.js';
import { AvatarKey, DisplayName, Email, Password, Phone, User } from './users.js';

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
  phone: Phone.optional(),
});
export type ParentContact = z.infer<typeof ParentContact>;

/**
 * Học sinh đăng ký: phải chọn lớp (danh sách GET /public/classes).
 * @deprecated từ 1.7.0 dùng `RegisterFamilyBody` (`auth/register-family`). Tài khoản tạo ra phải chờ duyệt: API trả
 * 403 `ACCOUNT_PENDING` thay vì token.
 */
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

const GoogleIdToken = z.string().min(1).max(4096);

/**
 * App gọi đăng nhập Google — quyết định việc làm khi email chưa có tài khoản: `game` (mặc định) → 422
 * PROFILE_REQUIRED (đăng ký gia đình); `admin` → tạo yêu cầu tài khoản giáo viên PENDING, trả 403 ACCOUNT_PENDING.
 */
export const GoogleApp = z.enum(['game', 'admin']);
export type GoogleApp = z.infer<typeof GoogleApp>;

/**
 * Email trùng tài khoản có sẵn → liên kết Google vào tài khoản đó (không báo trùng email). Tài khoản chưa xác nhận
 * email: mọi phiên cũ bị thu hồi; còn chờ duyệt / bị từ chối thì mật khẩu cũ cũng bị xoá (chống chiếm tài khoản).
 */
export const GoogleBody = z.strictObject({
  /** ID token từ Google Identity Services */
  idToken: GoogleIdToken,
  profile: GoogleProfile.optional(),
  /** Từ 1.14.0 */
  app: GoogleApp.optional(),
});
export type GoogleBody = z.infer<typeof GoogleBody>;

/** Liên kết Google vào tài khoản đang đăng nhập (`POST auth/google/link`) — từ 1.14.0 */
export const LinkGoogleBody = z.strictObject({ idToken: GoogleIdToken });
export type LinkGoogleBody = z.infer<typeof LinkGoogleBody>;

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
  /** Phiên của học sinh do phụ huynh mở (`auth/switch-profile`) — từ 1.7.0 */
  actor: z.object({ id: Id, displayName: DisplayName }).nullable().optional(),
});
export type MeResponse = z.infer<typeof MeResponse>;
