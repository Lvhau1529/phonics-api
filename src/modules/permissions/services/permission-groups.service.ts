import { Injectable } from '@nestjs/common';
import {
  type CreatePermissionGroupBody,
  type PermissionGroup,
  type UpdatePermissionGroupBody,
} from '@phonics/contracts';
import { AppError, notFound } from '../../../common/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { toGroupView } from '../dto/responses/permission-group.view';
import { PermissionRepository } from '../repositories/permission.repository';
import { type PermissionGroupRow } from '../types/permission.types';

/** CRUD nhóm quyền (`permission_groups`); nhóm hệ thống không xoá được */
@Injectable()
export class PermissionGroupsService {
  constructor(
    private readonly repo: PermissionRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PermissionGroup[]> {
    return (await this.repo.listGroups()).map(toGroupView);
  }

  async create(actor: AuthUser, body: CreatePermissionGroupBody): Promise<PermissionGroup> {
    await this.assertNameFree(body.name);
    const row = await this.repo.createGroup({
      name: body.name,
      description: body.description,
      permissions: [...new Set(body.permissions)],
    });
    const view = toGroupView(row);
    await this.audit.record(actor, 'permissionGroup.create', 'PermissionGroup', row.id, null, view);
    return view;
  }

  async update(actor: AuthUser, id: string, body: UpdatePermissionGroupBody): Promise<PermissionGroup> {
    const existing = await this.load(id);
    if (body.name && body.name !== existing.name) await this.assertNameFree(body.name);
    const row = await this.repo.updateGroup(id, {
      name: body.name,
      description: body.description,
      permissions: body.permissions ? [...new Set(body.permissions)] : undefined,
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

  async remove(actor: AuthUser, id: string): Promise<void> {
    const existing = await this.load(id);
    if (existing.isSystem) throw new AppError('FORBIDDEN', 403, { message: 'Không xoá nhóm quyền hệ thống' });
    await this.repo.deleteGroup(id);
    await this.audit.record(
      actor,
      'permissionGroup.delete',
      'PermissionGroup',
      id,
      toGroupView(existing),
      null,
    );
  }

  private async load(id: string): Promise<PermissionGroupRow> {
    const row = await this.repo.findGroup(id);
    if (!row) throw notFound('Không tìm thấy nhóm quyền');
    return row;
  }

  private async assertNameFree(name: string): Promise<void> {
    if (await this.repo.groupNameTaken(name)) {
      throw new AppError('CONFLICT', 409, { details: { name: ['Tên nhóm quyền đã tồn tại'] } });
    }
  }
}
