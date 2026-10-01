import { SetMetadata } from '@nestjs/common';
import { type Permission, type Role } from '@phonics/contracts';

export const ROLES_KEY = 'roles';
/** Chỉ các role này được gọi (ADMIN không tự động pass — liệt kê rõ) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSION_KEY = 'requirePermission';
/** Cần đủ các quyền này (ADMIN luôn pass). Phạm vi lớp kiểm tra riêng bằng AccessService. */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSION_KEY, permissions);
