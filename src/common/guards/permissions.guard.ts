import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission } from '@phonics/contracts';
import { type AuthUser } from '../../modules/auth/auth.types';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { PERMISSION_KEY } from '../decorators/roles.decorator';
import { AppError } from '../errors/app-error';

/**
 * Guard toàn cục #3: route có @RequirePermission(...) thì user phải có đủ quyền hiệu lực
 * (mặc định theo role ∪ GRANT − REVOKE). ADMIN luôn pass. Chỉ query DB khi route khai báo quyền.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new AppError('UNAUTHORIZED', 401);
    if (user.role === 'ADMIN') return true;
    const effective = await this.permissions.effectiveFor(user);
    const missing = required.filter((p) => !effective.has(p));
    if (missing.length) {
      throw new AppError('FORBIDDEN_PERMISSION', 403, { details: { permission: missing } });
    }
    return true;
  }
}
