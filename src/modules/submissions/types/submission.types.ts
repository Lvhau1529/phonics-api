import { type Prisma } from '../../../generated/prisma/client';
import { submissionSummaryInclude } from '../dto/responses/submission.view';

/** Bài nộp đầy đủ: người làm / người chấm + mọi câu trả lời + bài giao (snapshot) */
export const submissionDetailInclude = {
  ...submissionSummaryInclude,
  answers: true,
  assignment: true,
} satisfies Prisma.SubmissionInclude;

export type SubmissionRow = Prisma.SubmissionGetPayload<{ include: typeof submissionDetailInclude }>;
export type SubmissionAnswerRow = SubmissionRow['answers'][number];
