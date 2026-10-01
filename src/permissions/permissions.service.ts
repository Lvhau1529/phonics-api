import { Injectable } from '@nestjs/common';
import {
  isPermission,
  type Permission,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type UpdateUserPermissionsBody,
  type UserPermissionsResponse,
} from '@phonics/contracts';
import { type AuthUser } from '../auth/auth.types';
import { AppError, notFound } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Quyền hiệu lực = mặc định theo role ∪ GRANT − REVOKE (override lưu ở user_permissions) */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  catalog() {
    return PERMISSIONS.map((p) => ({ ...p, defaultRoles: [...p.defaultRoles] }));
  }

  async effectiveFor(user: Pick<AuthUser, 'id' | 'role'>): Promise<Set<Permission>> {
    const set = new Set<Permission>(ROLE_DEFAULT_PERMISSIONS[user.role]);
    if (user.role === 'ADMIN') return set;
    const overrides = await this.prisma.userPermission.findMany({ where: { userId: user.id } });
    for (const o of overrides) {
      if (!isPermission(o.permission)) continue; // mã cũ sau khi đổi catalog
      if (o.effect === 'GRANT') set.add(o.permission);
      else set.delete(o.permission);
    }
    return set;
  }

  async forUser(userId: string): Promise<UserPermissionsResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw notFound('Không tìm thấy người dùng');
    const overrides = await this.prisma.userPermission.findMany({
      where: { userId },
      include: { grantedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const effective = await this.effectiveFor(user);
    return {
      userId,
      role: user.role,
      defaults: [...ROLE_DEFAULT_PERMISSIONS[user.role]],
      overrides: overrides
        .filter((o) => isPermission(o.permission))
        .map((o) => ({
          permission: o.permission as Permission,
          effect: o.effect,
          grantedById: o.grantedById,
          grantedByName: o.grantedBy?.displayName ?? null,
          note: o.note,
          createdAt: o.createdAt.toISOString(),
        })),
      effective: [...effective],
    };
  }

  async update(
    actor: AuthUser,
    userId: string,
    body: UpdateUserPermissionsBody,
  ): Promise<UserPermissionsResponse> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) throw notFound('Không tìm thấy người dùng');
    if (target.role === 'ADMIN')
      throw new AppError('FORBIDDEN', 403, { message: 'Không sửa quyền của admin' });

    const before = await this.forUser(userId);
    await this.prisma.$transaction(async (tx) => {
      for (const permission of body.reset ?? []) {
        await tx.userPermission.deleteMany({ where: { userId, permission } });
      }
      for (const [effect, list] of [
        ['GRANT', body.grant ?? []],
        ['REVOKE', body.revoke ?? []],
      ] as const) {
        for (const permission of list) {
          await tx.userPermission.upsert({
            where: { userId_permission: { userId, permission } },
            create: { userId, permission, effect, grantedById: actor.id, note: body.note },
            update: { effect, grantedById: actor.id, note: body.note },
          });
        }
      }
    });
    const after = await this.forUser(userId);
    await this.audit.record(actor, 'permission.update', 'User', userId, before.effective, after.effective);
    return after;
  }
}
