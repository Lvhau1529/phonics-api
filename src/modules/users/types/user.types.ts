import { type Prisma } from '@/generated/prisma/client';

/** Include chuẩn để dựng contracts.User: profile + lớp đang học */
export const userViewInclude = {
  studentProfile: {
    select: {
      vietnameseName: true,
      englishName: true,
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

export type UserRow = Prisma.UserGetPayload<{ include: typeof userViewInclude }>;
