import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Route không cần access token (JwtAuthGuard bỏ qua) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'optionalAuth';
/** Route public nhưng nếu có bearer hợp lệ thì gắn req.user (vd. POST /public/events) */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);
