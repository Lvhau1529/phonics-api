import { Injectable } from '@nestjs/common';
import {
  type CreatePermissionGroupBody,
  isPermission,
  type Permission,
  type PermissionGroup,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type SetUserPermissionGroupsBody,
  type UpdatePermissionGroupBody,
  type UpdateUserPermissionsBody,
  type UserPermissionsResponse,
} from '@phonics/contracts';
import { AppError, notFound } from '../../common/errors/app-error';
import { PrismaService } from '../../core/database/prisma.service';
import { type Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { type AuthUser } from '../auth/auth.types';

const groupInclude = { _count: { select: { members: true } } } satisfies Prisma.PermissionGroupInclude;
type GroupRow = Prisma.PermissionGroupGetPayload<{ include: typeof groupInclude }>;

const onlyKnown = (codes: string[]): Permission[] => codes.filter(isPermission);

function toGroupView(row: GroupRow): PermissionGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: onlyKnown(row.permissions),
    isSystem: row.isSystem,
    memberCount: row._count.members,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Quyền hiệu lực = mặc định theo role ∪ quyền của các nhóm được gán ∪ GRANT − REVOKE.
 * Catalog quyền (chức năng) nằm trong contracts; nhóm quyền (`permission_groups`) do admin CRUD và gán cho user.
 */
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
    const [groups, overrides] = await Promise.all([
      this.prisma.userPermissionGroup.findMany({
        where: { userId: user.id },
        select: { group: { select: { permissions: true } } },
      }),
      this.prisma.userPermission.findMany({ where: { userId: user.id } }),
    ]);
    for (const g of groups) for (const code of onlyKnown(g.group.permissions)) set.add(code);
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
    const [overrides, groups, effective] = await Promise.all([
      this.prisma.userPermission.findMany({
        where: { userId },
        include: { grantedBy: { select: { displayName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.userPermissionGroup.findMany({
        where: { userId },
        select: { group: { select: { id: true, name: true, permissions: true } } },
        orderBy: { assignedAt: 'asc' },
      }),
      this.effectiveFor(user),
    ]);
    const defaults = new Set(ROLE_DEFAULT_PERMISSIONS[user.role]);
    const fromGroups = new Set<Permission>();
    for (const g of groups)
      for (const code of onlyKnown(g.group.permissions)) if (!defaults.has(code)) fromGroups.add(code);
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

  async update(
    actor: AuthUser,
    userId: string,
    body: UpdateUserPermissionsBody,
  ): Promise<UserPermissionsResponse> {
    await this.assertEditableTarget(userId);
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

  /** Thay toàn bộ nhóm quyền của user */
  async setGroups(
    actor: AuthUser,
    userId: string,
    body: SetUserPermissionGroupsBody,
  ): Promise<UserPermissionsResponse> {
    await this.assertEditableTarget(userId);
    const ids = [...new Set(body.groupIds)];
    const found = await this.prisma.permissionGroup.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new AppError('VALIDATION_ERROR', 400, { details: { groupIds: ['Có nhóm quyền không tồn tại'] } });
    }
    const before = await this.forUser(userId);
    await this.prisma.$transaction([
      this.prisma.userPermissionGroup.deleteMany({ where: { userId, groupId: { notIn: ids } } }),
      this.prisma.userPermissionGroup.createMany({
        data: ids.map((groupId) => ({ userId, groupId })),
        skipDuplicates: true,
      }),
    ]);
    const after = await this.forUser(userId);
    await this.audit.record(
      actor,
      'permission.setGroups',
      'User',
      userId,
      before.groups.map((g) => g.id),
      after.groups.map((g) => g.id),
    );
    return after;
  }

  // ---- nhóm quyền ----

  async listGroups(): Promise<PermissionGroup[]> {
    const rows = await this.prisma.permissionGroup.findMany({
      include: groupInclude,
      orderBy: { name: 'asc' },
    });
    return rows.map(toGroupView);
  }

  async createGroup(actor: AuthUser, body: CreatePermissionGroupBody): Promise<PermissionGroup> {
    await this.assertNameFree(body.name);
    const row = await this.prisma.permissionGroup.create({
      data: { name: body.name, description: body.description, permissions: [...new Set(body.permissions)] },
      include: groupInclude,
    });
    const view = toGroupView(row);
    await this.audit.record(actor, 'permissionGroup.create', 'PermissionGroup', row.id, null, view);
    return view;
  }

  async updateGroup(actor: AuthUser, id: string, body: UpdatePermissionGroupBody): Promise<PermissionGroup> {
    const existing = await this.prisma.permissionGroup.findUnique({ where: { id }, include: groupInclude });
    if (!existing) throw notFound('Không tìm thấy nhóm quyền');
    if (body.name && body.name !== existing.name) await this.assertNameFree(body.name);
    const row = await this.prisma.permissionGroup.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        permissions: body.permissions ? [...new Set(body.permissions)] : undefined,
      },
      include: groupInclude,
    });
    const view = toGroupView(row);
    await this.audit.record(
      actor,
      'permissionGroup.update',
      'PermissionGroup',
      id,
      toGroupView(existing),
      view,
    );
    return view;
  }

  async deleteGroup(actor: AuthUser, id: string): Promise<void> {
    const existing = await this.prisma.permissionGroup.findUnique({ where: { id }, include: groupInclude });
    if (!existing) throw notFound('Không tìm thấy nhóm quyền');
    if (existing.isSystem) throw new AppError('FORBIDDEN', 403, { message: 'Không xoá nhóm quyền hệ thống' });
    await this.prisma.permissionGroup.delete({ where: { id } }); // cascade user_permission_groups
    await this.audit.record(
      actor,
      'permissionGroup.delete',
      'PermissionGroup',
      id,
      toGroupView(existing),
      null,
    );
  }

  private async assertEditableTarget(userId: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw notFound('Không tìm thấy người dùng');
    if (target.role === 'ADMIN')
      throw new AppError('FORBIDDEN', 403, { message: 'Không sửa quyền của admin' });
  }

  private async assertNameFree(name: string): Promise<void> {
    const dup = await this.prisma.permissionGroup.findUnique({ where: { name }, select: { id: true } });
    if (dup) throw new AppError('CONFLICT', 409, { details: { name: ['Tên nhóm quyền đã tồn tại'] } });
  }
}
