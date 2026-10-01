import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { Role } from './users.js';

/**
 * Catalog quyền: nằm trong code (không có bảng), DB chỉ lưu override theo user (GRANT / REVOKE).
 * Thêm quyền = thêm vào PermissionCode + PERMISSIONS, dùng @RequirePermission ở API, trang Phân quyền
 * của admin tự hiện. ADMIN luôn pass mọi check; `defaultRoles` là quyền mặc định của role khi chưa override.
 */
export const PermissionCode = z.enum([
  'class.changeStudentClass',
  'points.award',
  'points.revoke',
  'students.edit',
  'students.viewParentContact',
  'games.unlock',
  'games.manage',
  'reports.export',
  'stats.view',
]);
export type Permission = z.infer<typeof PermissionCode>;

export interface PermissionDef {
  code: Permission;
  defaultRoles: readonly Role[];
  description: string;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  { code: 'class.changeStudentClass', defaultRoles: ['ADMIN'], description: 'Chuyển học sinh sang lớp khác' },
  { code: 'points.award', defaultRoles: ['ADMIN', 'TEACHER'], description: 'Cộng điểm thưởng cho học sinh' },
  { code: 'points.revoke', defaultRoles: ['ADMIN'], description: 'Tạo bút toán âm / sửa điểm' },
  { code: 'students.edit', defaultRoles: ['ADMIN', 'TEACHER'], description: 'Sửa tên, avatar học sinh' },
  { code: 'students.viewParentContact', defaultRoles: ['ADMIN'], description: 'Xem liên hệ phụ huynh' },
  { code: 'games.unlock', defaultRoles: ['ADMIN'], description: 'Mở / thu hồi khoá game cho học sinh' },
  { code: 'games.manage', defaultRoles: ['ADMIN'], description: 'Sửa catalog game (bật / tắt, giá, thứ tự)' },
  { code: 'reports.export', defaultRoles: ['ADMIN', 'TEACHER'], description: 'Xuất báo cáo xlsx / pdf' },
  { code: 'stats.view', defaultRoles: ['ADMIN', 'TEACHER'], description: 'Xem thống kê lớp / game' },
];

export const PERMISSION_CODES: readonly Permission[] = PermissionCode.options;

export const isPermission = (code: string): code is Permission => PermissionCode.safeParse(code).success;

/** Quyền mặc định theo role (ADMIN pass mọi check nên có đủ) */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSION_CODES,
  TEACHER: PERMISSIONS.filter((p) => p.defaultRoles.includes('TEACHER')).map((p) => p.code),
  STUDENT: [],
};

export const PermissionEffect = z.enum(['GRANT', 'REVOKE']);
export type PermissionEffect = z.infer<typeof PermissionEffect>;

export const PermissionDefView = z.object({
  code: PermissionCode,
  defaultRoles: z.array(Role),
  description: z.string(),
});
export type PermissionDefView = z.infer<typeof PermissionDefView>;

export const PermissionOverride = z.object({
  permission: PermissionCode,
  effect: PermissionEffect,
  grantedById: Id.nullable(),
  grantedByName: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type PermissionOverride = z.infer<typeof PermissionOverride>;

export const UserPermissionsResponse = z.object({
  userId: Id,
  role: Role,
  defaults: z.array(PermissionCode),
  overrides: z.array(PermissionOverride),
  effective: z.array(PermissionCode),
});
export type UserPermissionsResponse = z.infer<typeof UserPermissionsResponse>;

/** grant / revoke tạo override; reset xoá override (về mặc định của role) */
export const UpdateUserPermissionsBody = z
  .strictObject({
    grant: z.array(PermissionCode).optional(),
    revoke: z.array(PermissionCode).optional(),
    reset: z.array(PermissionCode).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((b) => (b.grant?.length ?? 0) + (b.revoke?.length ?? 0) + (b.reset?.length ?? 0) > 0, {
    message: 'Cần ít nhất một thay đổi',
  });
export type UpdateUserPermissionsBody = z.infer<typeof UpdateUserPermissionsBody>;
