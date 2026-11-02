import { type AuthResponse, type Role, type UserStatus } from '@phonics/contracts';

/** Người gọi đã xác thực (gắn ở req.user bởi JwtAuthGuard) */
export interface AuthUser {
  id: string;
  role: Role;
  status: UserStatus;
  tokenVersion: number;
  /** Phụ huynh đã mở phiên học sinh này (`auth/switch-profile`); null = học sinh tự đăng nhập */
  actorId?: string | null;
}

/** Payload access token */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  /** tokenVersion lúc ký — khác DB thì token vô hiệu */
  tv: number;
  /** Actor claim (RFC 8693): phụ huynh thao tác thay bé */
  act?: { sub: string };
}
export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export type AuthResult = Omit<AuthResponse, 'refreshToken'> & { refreshToken: string };
