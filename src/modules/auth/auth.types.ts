import { type Role, type UserStatus } from '@phonics/contracts';

/** Người gọi đã xác thực (gắn ở req.user bởi JwtAuthGuard) */
export interface AuthUser {
  id: string;
  role: Role;
  status: UserStatus;
  tokenVersion: number;
}

/** Payload access token */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  /** tokenVersion lúc ký — khác DB thì token vô hiệu */
  tv: number;
}
