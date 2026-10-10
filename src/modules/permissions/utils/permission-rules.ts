/** Luật quyền hiệu lực — hàm thuần */
import { isPermission, type Permission, ROLE_DEFAULT_PERMISSIONS, type Role } from '@phonics/contracts';
import { type PermissionOverride } from '../types/permission.types';

/** Bỏ mã quyền lạ (mã cũ còn trong DB sau khi đổi catalog) */
export const onlyKnown = (codes: readonly string[]): Permission[] => codes.filter(isPermission);

/**
 * Quyền hiệu lực = mặc định theo role ∪ quyền của các nhóm được gán ∪ GRANT − REVOKE.
 * ADMIN luôn có mọi quyền mặc định của admin (không xét nhóm / override).
 */
export function resolveEffective(
  role: Role,
  groupPermissions: readonly (readonly string[])[],
  overrides: readonly PermissionOverride[],
): Set<Permission> {
  const set = new Set<Permission>(ROLE_DEFAULT_PERMISSIONS[role]);
  if (role === 'ADMIN') return set;
  for (const codes of groupPermissions) for (const code of onlyKnown(codes)) set.add(code);
  for (const o of overrides) {
    if (!isPermission(o.permission)) continue;
    if (o.effect === 'GRANT') set.add(o.permission);
    else set.delete(o.permission);
  }
  return set;
}
