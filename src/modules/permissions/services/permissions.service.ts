import { Injectable } from '@nestjs/common';
import {
  isPermission,
  type Permission,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type UserPermissionsResponse,
} from '@phonics/contracts';
import { notFound } from '@/common/errors/app-error';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { PermissionRepository } from '@/modules/permissions/repositories/permission.repository';
import { onlyKnown, resolveEffective } from '@/modules/permissions/utils/permission-rules';

/**
 * Đọc quyền: catalog (contracts) và quyền hiệu lực của user. Global vì PermissionsGuard, AuthService cần.
 * Quyền hiệu lực = mặc định theo role ∪ quyền của các nhóm được gán ∪ GRANT − REVOKE.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly repo: PermissionRepository) {}

  catalog() {
    return PERMISSIONS.map((p) => ({ ...p, defaultRoles: [...p.defaultRoles] }));
  }

  async effectiveFor(user: Pick<AuthUser, 'id' | 'role'>): Promise<Set<Permission>> {
    if (user.role === 'ADMIN') return resolveEffective('ADMIN', [], []);
    const [groups, overrides] = await Promise.all([
      this.repo.groupPermissionsOf(user.id),
      this.repo.overridesOf(user.id),
    ]);
    return resolveEffective(user.role, groups, overrides);
  }

  async forUser(userId: string): Promise<UserPermissionsResponse> {
    const user = await this.repo.findUserRole(userId);
    if (!user) throw notFound('userNotFound');
    const [overrides, groups, effective] = await Promise.all([
      this.repo.overridesWithGranter(userId),
      this.repo.groupsOf(userId),
      this.effectiveFor(user),
    ]);
    const defaults = new Set(ROLE_DEFAULT_PERMISSIONS[user.role]);
    const fromGroups = new Set<Permission>();
    for (const g of groups) {
      for (const code of onlyKnown(g.group.permissions)) if (!defaults.has(code)) fromGroups.add(code);
    }
    return {
      userId,
      role: user.role,
      defaults: [...defaults],
      groups: groups.map((g) => ({
        id: g.group.id,
        name: g.group.name,
        permissions: onlyKnown(g.group.permissions),
      })),
      fromGroups: [...fromGroups],
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
}
