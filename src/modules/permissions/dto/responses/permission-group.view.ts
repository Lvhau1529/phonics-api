import { type PermissionGroup } from '@phonics/contracts';
import { type PermissionGroupRow } from '../../types/permission.types';
import { onlyKnown } from '../../utils/permission-rules';

export function toGroupView(row: PermissionGroupRow): PermissionGroup {
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
