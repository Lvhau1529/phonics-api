import {
  QuestionAnswer,
  type SnapshotItem,
  type SubmissionAnswerView,
  type SubmissionSummary,
} from '@phonics/contracts';
import { clamp } from 'es-toolkit';
import { type Prisma } from '@/generated/prisma/client';

/** Include tối thiểu để dựng SubmissionSummary */
export const submissionSummaryInclude = {
  student: { select: { user: { select: { displayName: true } } } },
  gradedBy: { select: { displayName: true } },
} satisfies Prisma.SubmissionInclude;

export type SubmissionSummaryRow = Prisma.SubmissionGetPayload<{ include: typeof submissionSummaryInclude }>;

export const percentOf = (score: number | null, max: number): number | null =>
  score === null || max <= 0 ? null : clamp(score / max, 0, 1);

/** Hàm thuần dùng chung (assignments cũng cần) — đặt ở view để tránh import vòng giữa các service */
export function toSubmissionSummary(row: SubmissionSummaryRow): SubmissionSummary {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    studentName: row.student.user.displayName,
    attemptNo: row.attemptNo,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    gradedAt: row.gradedAt?.toISOString() ?? null,
    gradedById: row.gradedById,
    gradedByName: row.gradedBy?.displayName ?? null,
    autoScore: row.autoScore,
    manualScore: row.manualScore,
    totalScore: row.totalScore,
    maxScore: row.maxScore,
    percent: percentOf(row.totalScore, row.maxScore),
    durationMs: row.durationMs,
    late: row.late,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Một câu trong bài nộp: câu trả lời (parse lại theo contracts), điểm, nhận xét; đáp án chỉ khi `showKeys` */
export function toAnswerView(
  item: SnapshotItem,
  row:
    | {
        answer: unknown;
        isCorrect: boolean | null;
        autoScore: number | null;
        manualScore: number | null;
        teacherNote: string | null;
        gradeDetail: unknown;
        gradedAt: Date | null;
      }
    | undefined,
  showKeys: boolean,
): SubmissionAnswerView {
  const parsed = row ? QuestionAnswer.safeParse(row.answer) : null;
  return {
    worksheetItemId: item.worksheetItemId,
    questionType: item.question.type,
    maxPoints: item.points,
    answer: parsed?.success ? parsed.data : null,
    isCorrect: row?.isCorrect ?? null,
    autoScore: row?.autoScore ?? null,
    manualScore: row?.manualScore ?? null,
    score: row ? (row.manualScore ?? row.autoScore ?? null) : null,
    teacherNote: row?.teacherNote ?? null,
    gradeDetail: (row?.gradeDetail as Record<string, unknown> | null) ?? null,
    gradedAt: row?.gradedAt?.toISOString() ?? null,
    answerKey: showKeys ? item.question.answerKey : null,
  };
}
