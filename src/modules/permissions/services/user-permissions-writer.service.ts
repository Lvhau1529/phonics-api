import { Injectable } from '@nestjs/common';
import {
  type SetUserPermissionGroupsBody,
  type UpdateUserPermissionsBody,
  type UserPermissionsResponse,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { AuditService } from '@/modules/audit/services/audit.service';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { PermissionRepository } from '@/modules/permissions/repositories/permission.repository';
import { PermissionsService } from '@/modules/permissions/services/permissions.service';

/** Admin sửa quyền riêng (GRANT / REVOKE) và nhóm quyền của một user (không sửa được admin) */
@Injectable()
export class UserPermissionsWriterService {
  constructor(
    private readonly repo: PermissionRepository,
    private readonly reader: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  async update(
    actor: AuthUser,
    userId: string,
    body: UpdateUserPermissionsBody,
  ): Promise<UserPermissionsResponse> {
    await this.assertEditableTarget(userId);
    const before = await this.reader.forUser(userId);
    await this.repo.applyOverrides(
      userId,
      { reset: body.reset ?? [], grant: body.grant ?? [], revoke: body.revoke ?? [] },
      { grantedById: actor.id, note: body.note },
    );
    const after = await this.reader.forUser(userId);
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
    if ((await this.repo.countGroups(ids)) !== ids.length) {
      throw new AppError('VALIDATION_ERROR', 400, { details: { groupIds: ['Có nhóm quyền không tồn tại'] } });
    }
    const before = await this.reader.forUser(userId);
    await this.repo.replaceUserGroups(userId, ids);
    const after = await this.reader.forUser(userId);
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

  private async assertEditableTarget(userId: string): Promise<void> {
    const target = await this.repo.findUserRole(userId);
    if (!target) throw notFound('Không tìm thấy người dùng');
    if (target.role === 'ADMIN')
      throw new AppError('FORBIDDEN', 403, { message: 'Không sửa quyền của admin' });
  }
}
