import { type Prisma } from '@/generated/prisma/client';

/** Include chuẩn để dựng QuestionSummary / QuestionView (đếm số phiếu chưa archive đang dùng câu) */
export const questionInclude = {
  createdBy: { select: { displayName: true } },
  _count: { select: { items: { where: { worksheet: { status: { not: 'ARCHIVED' } } } } } },
} satisfies Prisma.QuestionInclude;

export type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

/** Trường sắp xếp được phép ở GET /questions */
export const QUESTION_SORT_FIELDS = ['createdAt', 'updatedAt', 'type', 'points', 'status'] as const;
