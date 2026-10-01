import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthUser } from '../../modules/auth/auth.types';

/** `@CurrentUser() user: AuthUser` — do JwtAuthGuard gắn vào request */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser dùng ở route chưa qua JwtAuthGuard');
  return req.user;
});

/** Như CurrentUser nhưng cho phép undefined (route @OptionalAuth) */
export const MaybeUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
  },
);
