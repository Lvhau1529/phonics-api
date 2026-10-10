import { type Prisma } from '../../../generated/prisma/client';

export const permissionGroupInclude = {
  _count: { select: { members: true } },
} satisfies Prisma.PermissionGroupInclude;

export type PermissionGroupRow = Prisma.PermissionGroupGetPayload<{ include: typeof permissionGroupInclude }>;

/** Một dòng GRANT / REVOKE riêng của user */
export interface PermissionOverride {
  permission: string;
  effect: 'GRANT' | 'REVOKE';
}
