/** Dựng view người dùng (shape contracts) từ dòng Prisma — hàm thuần */
import { AvatarKey, DEFAULT_AVATAR, type User } from '@phonics/contracts';
import { type UserRow } from '@/modules/users/types/user.types';

/** Chuyển row Prisma → contracts.User (không lộ hash / token) */
export function toUserView(row: UserRow): User {
  const membership = row.studentProfile?.memberships[0];
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    provider: row.provider,
    displayName: row.displayName,
    avatarKey: AvatarKey.safeParse(row.avatarKey).data ?? DEFAULT_AVATAR,
    class: membership ? { ...membership.class, joinedAt: membership.joinedAt.toISOString() } : null,
    createdAt: row.createdAt.toISOString(),
    loginMethods: { password: row.passwordHash !== null, google: row.googleSub !== null },
  };
}
