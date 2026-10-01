import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role } from '@phonics/contracts';
import { type AuthUser } from '../../modules/auth/auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppError } from '../errors/app-error';

/** Guard toàn cục #2: route có @Roles(...) thì user phải thuộc một trong các role đó */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new AppError('UNAUTHORIZED', 401);
    if (!roles.includes(user.role)) throw new AppError('FORBIDDEN', 403);
    return true;
  }
}
