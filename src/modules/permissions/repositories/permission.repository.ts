import { Injectable } from '@nestjs/common';
import { type Role } from '@phonics/contracts';
import { PrismaService } from '@/database/prisma.service';
import { type Prisma } from '@/generated/prisma/client';
import {
  permissionGroupInclude,
  type PermissionGroupRow,
  type PermissionOverride,
} from '@/modules/permissions/types/permission.types';

/** Truy cập user_permissions, permission_groups, user_permission_groups */
@Injectable()
export class PermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserRole(userId: string): Promise<{ id: string; role: Role } | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  }

  // ---------- quyền của user ----------

  /** Danh sách quyền của từng nhóm user được gán */
  async groupPermissionsOf(userId: string): Promise<string[][]> {
    const rows = await this.prisma.userPermissionGroup.findMany({
      where: { userId },
      select: { group: { select: { permissions: true } } },
    });
    return rows.map((r) => r.group.permissions);
  }

  overridesOf(userId: string): Promise<PermissionOverride[]> {
    return this.prisma.userPermission.findMany({ where: { userId } });
  }

  overridesWithGranter(userId: string) {
    return this.prisma.userPermission.findMany({
      where: { userId },
      include: { grantedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  groupsOf(userId: string) {
    return this.prisma.userPermissionGroup.findMany({
      where: { userId },
      select: { group: { select: { id: true, name: true, permissions: true } } },
      orderBy: { assignedAt: 'asc' },
    });
  }

  /** Bỏ override `reset`, ghi GRANT / REVOKE (upsert) — một transaction */
  async applyOverrides(
    userId: string,
    changes: { reset: readonly string[]; grant: readonly string[]; revoke: readonly string[] },
    meta: { grantedById: string; note?: string | null },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const permission of changes.reset) {
        await tx.userPermission.deleteMany({ where: { userId, permission } });
      }
      for (const [effect, list] of [
        ['GRANT', changes.grant],
        ['REVOKE', changes.revoke],
      ] as const) {
        for (const permission of list) {
          await tx.userPermission.upsert({
            where: { userId_permission: { userId, permission } },
            create: { userId, permission, effect, grantedById: meta.grantedById, note: meta.note },
            update: { effect, grantedById: meta.grantedById, note: meta.note },
          });
        }
      }
    });
  }

  /** Thay toàn bộ nhóm của user bằng `groupIds` */
  async replaceUserGroups(userId: string, groupIds: readonly string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userPermissionGroup.deleteMany({ where: { userId, groupId: { notIn: [...groupIds] } } }),
      this.prisma.userPermissionGroup.createMany({
        data: groupIds.map((groupId) => ({ userId, groupId })),
        skipDuplicates: true,
      }),
    ]);
  }

  // ---------- nhóm quyền ----------

  countGroups(ids: readonly string[]): Promise<number> {
    return this.prisma.permissionGroup.count({ where: { id: { in: [...ids] } } });
  }

  listGroups(): Promise<PermissionGroupRow[]> {
    return this.prisma.permissionGroup.findMany({
      include: permissionGroupInclude,
      orderBy: { name: 'asc' },
    });
  }

  findGroup(id: string): Promise<PermissionGroupRow | null> {
    return this.prisma.permissionGroup.findUnique({ where: { id }, include: permissionGroupInclude });
  }

  async groupNameTaken(name: string): Promise<boolean> {
    return !!(await this.prisma.permissionGroup.findUnique({ where: { name }, select: { id: true } }));
  }

  createGroup(data: Prisma.PermissionGroupCreateInput): Promise<PermissionGroupRow> {
    return this.prisma.permissionGroup.create({ data, include: permissionGroupInclude });
  }

  updateGroup(id: string, data: Prisma.PermissionGroupUpdateInput): Promise<PermissionGroupRow> {
    return this.prisma.permissionGroup.update({ where: { id }, data, include: permissionGroupInclude });
  }

  /** Cascade user_permission_groups */
  async deleteGroup(id: string): Promise<void> {
    await this.prisma.permissionGroup.delete({ where: { id } });
  }
}
