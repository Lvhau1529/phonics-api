import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { MediaMap } from './media.js';
import { Points, QuestionAnswer, QuestionAnswerKey, QuestionType } from './questions.js';
import { StudentWorksheetView, WorksheetSnapshot } from './worksheets.js';

/**
 * Bài nộp (một lần làm). IN_PROGRESS → SUBMITTED (có câu chấm tay, chờ GV) → GRADED.
 * Không có câu chấm tay thì submit xong là GRADED ngay. Điểm phiếu tách khỏi sổ điểm game (ADR 0019).
 */
export const SubmissionStatus = z.enum(['IN_PROGRESS', 'SUBMITTED', 'GRADED']);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

/** PUT /me/submissions/:id/answers — autosave, upsert theo worksheetItemId */
export const SaveAnswersBody = z.strictObject({
  answers: z
    .array(z.strictObject({ worksheetItemId: Id, answer: QuestionAnswer }))
    .min(1)
    .max(100),
});
export type SaveAnswersBody = z.infer<typeof SaveAnswersBody>;

export const SaveAnswersResponse = z.object({ saved: z.int().min(0), updatedAt: IsoDateTime });
export type SaveAnswersResponse = z.infer<typeof SaveAnswersResponse>;

/** Điểm là số thực (một phần), bội của 0.25 khi GV chấm */
export const Score = z.number().min(0);

export const SubmissionAnswerView = z.object({
  worksheetItemId: Id,
  questionType: QuestionType,
  maxPoints: Points,
  answer: QuestionAnswer.nullable(),
  isCorrect: z.boolean().nullable(),
  autoScore: Score.nullable(),
  manualScore: Score.nullable(),
  /** manualScore ?? autoScore */
  score: Score.nullable(),
  teacherNote: z.string().nullable(),
  /** Chi tiết chấm tự động (phần nào đúng) để client tô màu */
  gradeDetail: z.record(z.string(), z.unknown()).nullable(),
  gradedAt: IsoDateTime.nullable(),
  /** GV luôn có; học sinh chỉ có khi GRADED và bài giao bật showAnswersAfterSubmit */
  answerKey: QuestionAnswerKey.nullable(),
});
export type SubmissionAnswerView = z.infer<typeof SubmissionAnswerView>;

export const SubmissionSummary = z.object({
  id: Id,
  assignmentId: Id,
  studentId: Id,
  studentName: z.string(),
  attemptNo: z.int().min(1),
  status: SubmissionStatus,
  startedAt: IsoDateTime,
  submittedAt: IsoDateTime.nullable(),
  gradedAt: IsoDateTime.nullable(),
  gradedById: Id.nullable(),
  gradedByName: z.string().nullable(),
  autoScore: Score,
  manualScore: Score.nullable(),
  /** Chỉ có khi GRADED */
  totalScore: Score.nullable(),
  maxScore: z.int().min(0),
  /** totalScore / maxScore, 0..1 */
  percent: z.number().min(0).max(1).nullable(),
  durationMs: z.int().min(0).nullable(),
  late: z.boolean(),
  /** Lần lưu câu trả lời gần nhất (client dùng để so với bản nháp cục bộ) */
  updatedAt: IsoDateTime,
});
export type SubmissionSummary = z.infer<typeof SubmissionSummary>;

export const SubmissionDetail = SubmissionSummary.extend({
  answers: z.array(SubmissionAnswerView),
  /** GV: snapshot đầy đủ; học sinh: bản không có answerKey */
  worksheet: z.union([WorksheetSnapshot, StudentWorksheetView]),
  media: MediaMap,
  /** Số câu chấm tay chưa có điểm */
  pendingManual: z.int().min(0),
});
export type SubmissionDetail = z.infer<typeof SubmissionDetail>;

export const SubmitResponse = z.object({
  submission: SubmissionSummary,
  /** Có ngay khi bài không có câu chấm tay */
  rank: z.object({ rank: z.int().min(1), members: z.int().min(0) }).nullable(),
});
export type SubmitResponse = z.infer<typeof SubmitResponse>;

export const GradeSubmissionBody = z.strictObject({
  items: z
    .array(
      z.strictObject({
        worksheetItemId: Id,
        manualScore: Score.multipleOf(0.25),
        teacherNote: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .max(100)
    .default([]),
  /** true = chốt: mọi câu chấm tay phải có điểm → GRADED + thông báo học sinh */
  finalize: z.boolean().default(false),
});
export type GradeSubmissionBody = z.infer<typeof GradeSubmissionBody>;

export const SubmissionListQuery = PageQuery.extend({
  status: SubmissionStatus.optional(),
  studentId: Id.optional(),
});
export type SubmissionListQuery = z.infer<typeof SubmissionListQuery>;

/** Trạng thái một học sinh trong roster của bài giao (MISSING = chưa làm) */
export const RosterStatus = z.enum(['MISSING', 'IN_PROGRESS', 'SUBMITTED', 'GRADED']);
export type RosterStatus = z.infer<typeof RosterStatus>;
