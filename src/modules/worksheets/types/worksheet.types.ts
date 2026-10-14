import { type Prisma } from '@/generated/prisma/client';
import { questionInclude } from '@/modules/questions/types/question.types';

/** Include cho WorksheetSummary (đếm item / bài giao + điểm hiệu lực từng item) */
export const worksheetSummaryInclude = {
  createdBy: { select: { displayName: true } },
  _count: { select: { assignments: true } },
  items: { select: { pointsOverride: true, question: { select: { points: true } } } },
} satisfies Prisma.WorksheetInclude;

/** Include cho WorksheetDetail: sections → items → question (đủ để dựng QuestionView) */
export const worksheetDetailInclude = {
  ...worksheetSummaryInclude,
  sections: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' }, include: { question: { include: questionInclude } } } },
  },
} satisfies Prisma.WorksheetInclude;

export type WorksheetSummaryRow = Prisma.WorksheetGetPayload<{ include: typeof worksheetSummaryInclude }>;
export type WorksheetDetailRow = Prisma.WorksheetGetPayload<{ include: typeof worksheetDetailInclude }>;

/** Dữ liệu đóng băng vào snapshot khi giao bài (đủ để chấm: config + answerKey + điểm) */
export const worksheetSnapshotSelect = {
  id: true,
  title: true,
  subject: true,
  topic: true,
  grade: true,
  week: true,
  day: true,
  kind: true,
  status: true,
  sections: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      order: true,
      title: true,
      instruction: true,
      items: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          pointsOverride: true,
          question: {
            select: {
              id: true,
              type: true,
              instruction: true,
              instructionVi: true,
              points: true,
              example: true,
              config: true,
              answerKey: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WorksheetSelect;

/** Trường sắp xếp được phép ở GET /worksheets */
export const WORKSHEET_SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'week', 'day', 'status'] as const;
