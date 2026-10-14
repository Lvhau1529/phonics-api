import { type Prisma } from '@/generated/prisma/client';

/** Include chuẩn để dựng StudentSummary / StudentDetail: profile + lớp đang học */
export const studentInclude = {
  studentProfile: {
    select: {
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
export const STUDENT_SORT_FIELDS = ['displayName', 'email', 'status', 'createdAt', 'lastLoginAt'] as const;
export const GAME_RESULT_SORT_FIELDS = ['playedAt', 'createdAt', 'score', 'correct'] as const;
