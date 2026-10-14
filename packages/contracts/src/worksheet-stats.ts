import { z } from 'zod';
import { IsoDate, IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { RangeQuery } from './common/range.js';
import { QuestionType } from './questions.js';
import { SubmissionStatus } from './submissions.js';

/** Thống kê phiếu bài tập (tách khỏi stats điểm game) */
export const TypeAccuracy = z.object({
  type: QuestionType,
  answered: z.int().min(0),
  correct: z.int().min(0),
  /** correct / answered */
  accuracy: z.number().min(0).max(1),
  /** Trung bình score / maxPoints */
  avgScoreRatio: z.number().min(0).max(1),
});
export type TypeAccuracy = z.infer<typeof TypeAccuracy>;

export const WeekBucket = z.object({
  /** Thứ hai đầu tuần (theo scheduledFor) */
  weekStart: IsoDate,
  assignments: z.int().min(0),
  submissions: z.int().min(0),
  avgPercent: z.number().min(0).max(1).nullable(),
});
export type WeekBucket = z.infer<typeof WeekBucket>;

export const WorksheetStatsQuery = RangeQuery;
export type WorksheetStatsQuery = z.infer<typeof WorksheetStatsQuery>;

export const ClassWorksheetOverview = z.object({
  classId: Id,
  assignments: z.int().min(0),
  open: z.int().min(0),
  avgPercent: z.number().min(0).max(1).nullable(),
  /** submitted / (students × assignments đã đóng hoặc quá hạn) */
  completionRate: z.number().min(0).max(1).nullable(),
  lateRate: z.number().min(0).max(1).nullable(),
  pendingGrading: z.int().min(0),
  byType: z.array(TypeAccuracy),
  trend: z.array(WeekBucket),
  generatedAt: IsoDateTime,
});
export type ClassWorksheetOverview = z.infer<typeof ClassWorksheetOverview>;

export const StudentWorksheetRecent = z.object({
  assignmentId: Id,
  worksheetTitle: z.string(),
  scheduledFor: IsoDate,
  submissionId: Id.nullable(),
  status: SubmissionStatus.nullable(),
  totalScore: z.number().nullable(),
  maxScore: z.int().min(0),
  percent: z.number().min(0).max(1).nullable(),
  late: z.boolean(),
  rank: z.int().min(1).nullable(),
});
export type StudentWorksheetRecent = z.infer<typeof StudentWorksheetRecent>;

export const StudentWorksheetStats = z.object({
  studentId: Id,
  done: z.int().min(0),
  late: z.int().min(0),
  /** Bài đã đóng / quá hạn mà không nộp */
  missing: z.int().min(0),
  inProgress: z.int().min(0),
  pendingGrading: z.int().min(0),
  avgPercent: z.number().min(0).max(1).nullable(),
  bestPercent: z.number().min(0).max(1).nullable(),
  byType: z.array(TypeAccuracy),
  trend: z.array(WeekBucket),
  recent: z.array(StudentWorksheetRecent),
  generatedAt: IsoDateTime,
});
export type StudentWorksheetStats = z.infer<typeof StudentWorksheetStats>;

export const AssignmentItemStats = z.object({
  worksheetItemId: Id,
  sectionTitle: z.string(),
  order: z.int().min(0),
  type: QuestionType,
  instruction: z.string(),
  points: z.int().min(1),
  answered: z.int().min(0),
  correct: z.int().min(0),
  avgScore: z.number().min(0),
  /** correct / answered */
  accuracy: z.number().min(0).max(1),
});
export type AssignmentItemStats = z.infer<typeof AssignmentItemStats>;

export const ScoreBucket = z.object({
  /** "0-20", "21-40", "41-60", "61-80", "81-100" */
  label: z.string(),
  from: z.int().min(0).max(100),
  to: z.int().min(0).max(100),
  count: z.int().min(0),
});
export type ScoreBucket = z.infer<typeof ScoreBucket>;

export const AssignmentStats = z.object({
  assignmentId: Id,
  students: z.int().min(0),
  submitted: z.int().min(0),
  graded: z.int().min(0),
  missing: z.int().min(0),
  late: z.int().min(0),
  avgPercent: z.number().min(0).max(1).nullable(),
  distribution: z.array(ScoreBucket),
  items: z.array(AssignmentItemStats),
  generatedAt: IsoDateTime,
});
export type AssignmentStats = z.infer<typeof AssignmentStats>;
