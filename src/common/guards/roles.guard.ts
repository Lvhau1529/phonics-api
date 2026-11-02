import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role } from '@phonics/contracts';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { ALLOW_PARENT_KEY } from '@/common/decorators/account.decorator';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from '@/common/decorators/public.decorator';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { AppError } from '@/common/errors/app-error';

/**
 * Guard toàn cục #2: route có @Roles(...) thì user phải thuộc một trong các role đó. PARENT (tài khoản gia đình) chỉ
 * gọi được route liệt kê PARENT trong @Roles, có @AllowParent hoặc route public / @OptionalAuth — các route cũ không
 * khai báo role (vd `/me/*` của học sinh) không mở cho PARENT.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!roles?.length) {
      const open = [ALLOW_PARENT_KEY, IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY].some((key) =>
        this.reflector.getAllAndOverride<boolean>(key, targets),
      );
      if (user?.role === 'PARENT' && !open) {
        throw new AppError('FORBIDDEN', 403);
      }
      return true;
    }
    if (!user) throw new AppError('UNAUTHORIZED', 401);
    if (!roles.includes(user.role)) throw new AppError('FORBIDDEN', 403);
    return true;
  }
}
