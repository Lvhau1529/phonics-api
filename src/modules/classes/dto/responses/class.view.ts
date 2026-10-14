import { type ClassSummary, AvatarKey, DEFAULT_AVATAR } from '@phonics/contracts';
import { type ClassRow } from '@/modules/classes/types/class.types';

export function toClassSummary(row: ClassRow): ClassSummary {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    schoolYear: row.schoolYear,
    joinVisible: row.joinVisible,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    studentCount: row._count.memberships,
    teachers: row.teachers.map(({ teacher }) => ({
      id: teacher.id,
      displayName: teacher.displayName,
      email: teacher.email,
      avatarKey: AvatarKey.safeParse(teacher.avatarKey).data ?? DEFAULT_AVATAR,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
