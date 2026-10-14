import { type Prisma } from '@/generated/prisma/client';

/** Include chuẩn để dựng ClassSummary: giáo viên + số học sinh đang học */
export const classSummaryInclude = {
  teachers: {
    orderBy: { assignedAt: 'asc' },
    select: { teacher: { select: { id: true, displayName: true, email: true, avatarKey: true } } },
  },
  _count: { select: { memberships: { where: { leftAt: null } } } },
} satisfies Prisma.ClassInclude;

export type ClassRow = Prisma.ClassGetPayload<{ include: typeof classSummaryInclude }>;

export const CLASS_SORT_FIELDS = ['name', 'grade', 'schoolYear', 'createdAt', 'updatedAt'] as const;
