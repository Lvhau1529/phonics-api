import { type Prisma } from '@/generated/prisma/client';

/** Include chuẩn để dựng StudentSummary / StudentDetail: profile + lớp đang học */
export const studentInclude = {
  studentProfile: {
    select: {
      vietnameseName: true,
      englishName: true,
      parentName: true,
      parentEmail: true,
      parentPhone: true,
      notes: true,
      memberships: {
        where: { leftAt: null },
        take: 1,
        select: {
          joinedAt: true,
          class: { select: { id: true, name: true, grade: true, schoolYear: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export type StudentRow = Prisma.UserGetPayload<{ include: typeof studentInclude }>;

/** Trường sắp xếp được phép ở GET /students và GET /students/:id/game-results */
export const STUDENT_SORT_FIELDS = [
  'displayName',
  'vietnameseName',
  'email',
  'status',
  'createdAt',
  'lastLoginAt',
] as const;
/** Sắp theo tên tiếng Việt = theo tên (từ cuối) rồi họ tên — cột `name_sort_key` của profile */
export function studentOrderBy(
  order: Partial<Record<(typeof STUDENT_SORT_FIELDS)[number], 'asc' | 'desc'>>,
): Prisma.UserOrderByWithRelationInput {
  const { vietnameseName, ...rest } = order;
  return vietnameseName ? { studentProfile: { nameSortKey: vietnameseName } } : rest;
}

export const GAME_RESULT_SORT_FIELDS = ['playedAt', 'createdAt', 'score', 'correct'] as const;
