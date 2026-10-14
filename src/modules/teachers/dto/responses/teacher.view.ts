import { type TeacherSummary, AvatarKey, DEFAULT_AVATAR } from '@phonics/contracts';
import { type TeacherRow } from '@/modules/teachers/types/teacher.types';

export function toTeacherSummary(row: TeacherRow): TeacherSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarKey: AvatarKey.safeParse(row.avatarKey).data ?? DEFAULT_AVATAR,
    status: row.status,
    provider: row.provider,
    hasPassword: row.passwordHash != null,
    classes: row.teachingClasses.map((t) => t.class),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
