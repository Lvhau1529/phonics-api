import { type Prisma } from '@/generated/prisma/client';

export const commentInclude = {
  author: { select: { displayName: true, role: true, avatarKey: true } },
} satisfies Prisma.CommentInclude;

export type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;
