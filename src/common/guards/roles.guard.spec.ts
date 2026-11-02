import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ALLOW_PARENT_KEY } from '@/common/decorators/account.decorator';
import { OPTIONAL_AUTH_KEY } from '@/common/decorators/public.decorator';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { type AuthUser } from '@/modules/auth/types/auth.types';

function ctx(meta: Record<string, unknown>, user?: Partial<AuthUser>): [RolesGuard, ExecutionContext] {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(meta)) Reflect.defineMetadata(key, value, handler);
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return [new RolesGuard(new Reflector()), context];
}

describe('RolesGuard', () => {
  it('PARENT bị chặn ở route không khai báo role (vd /me/* của học sinh)', () => {
    const [guard, context] = ctx({}, { role: 'PARENT' });
    expect(() => guard.canActivate(context)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    const [studentGuard, studentCtx] = ctx({}, { role: 'STUDENT' });
    expect(studentGuard.canActivate(studentCtx)).toBe(true);
  });

  it('PARENT qua được route @AllowParent, @OptionalAuth hoặc @Roles có PARENT', () => {
    for (const meta of [
      { [ALLOW_PARENT_KEY]: true },
      { [OPTIONAL_AUTH_KEY]: true },
      { [ROLES_KEY]: ['PARENT'] },
    ]) {
      const [guard, context] = ctx(meta, { role: 'PARENT' });
      expect(guard.canActivate(context)).toBe(true);
    }
    const [guard, context] = ctx({ [ROLES_KEY]: ['STUDENT'] }, { role: 'PARENT' });
    expect(() => guard.canActivate(context)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});
