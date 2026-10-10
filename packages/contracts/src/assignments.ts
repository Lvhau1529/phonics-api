import { z } from 'zod';
import { IsoDate, IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';
import { PageQuery } from './common/pagination.js';
import { MediaMap } from './media.js';
import { RosterStatus, SubmissionStatus, SubmissionSummary } from './submissions.js';
import { AvatarKey, DisplayName } from './users.js';
import { StudentWorksheetView, Subject, WorksheetKind, WorksheetSnapshot } from './worksheets.js';

/**
 * Bài giao = worksheet × lớp, có ngày trên lịch (`scheduledFor`), cửa sổ làm bài, số lần làm.
 * SCHEDULED (chưa tới availableFrom) → OPEN → CLOSED (quá hạn khi allowLate=false, hoặc GV đóng).
 * "Đang mở" luôn tính lại tại request: OPEN && now ≥ availableFrom && (!dueAt || now < dueAt || allowLate).
 */
export const AssignmentStatus = z.enum(['SCHEDULED', 'OPEN', 'CLOSED']);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

export const MaxAttempts = z.int().min(1).max(10);

export const CreateAssignmentBody = z
  .strictObject({
    worksheetId: Id,
    classId: Id,
    /** Ngày trên lịch quản lý (APP_TIMEZONE) */
    scheduledFor: IsoDate,
    /** Mặc định 00:00 của scheduledFor */
    availableFrom: IsoDateTime.optional(),
    dueAt: IsoDateTime.optional(),
    allowLate: z.boolean().default(false),
    maxAttempts: MaxAttempts.default(1),
    showAnswersAfterSubmit: z.boolean().default(false),
  })
  .refine((b) => !b.dueAt || !b.availableFrom || b.dueAt > b.availableFrom, {
    path: ['dueAt'],
    message: 'Hạn nộp phải sau thời điểm mở',
  });
export type CreateAssignmentBody = z.infer<typeof CreateAssignmentBody>;

export const UpdateAssignmentBody = z
  .strictObject({
    scheduledFor: IsoDate,
    availableFrom: IsoDateTime,
    dueAt: IsoDateTime.nullable(),
    allowLate: z.boolean(),
    maxAttempts: MaxAttempts,
    showAnswersAfterSubmit: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Cần ít nhất một trường' });
export type UpdateAssignmentBody = z.infer<typeof UpdateAssignmentBody>;

export const AssignmentCounts = z.object({
  students: z.int().min(0),
  submitted: z.int().min(0),
  graded: z.int().min(0),
  missing: z.int().min(0),
  /** Bài SUBMITTED chờ GV chấm tay */
  pendingGrading: z.int().min(0),
  avgPercent: z.number().min(0).max(1).nullable(),
});
export type AssignmentCounts = z.infer<typeof AssignmentCounts>;

export const AssignmentSummary = z.object({
  id: Id,
  worksheetId: Id,
  worksheetTitle: z.string(),
  subject: Subject,
  topic: z.string().nullable(),
  kind: WorksheetKind,
  classId: Id,
  className: z.string(),
  assignedById: Id,
  assignedByName: z.string(),
  scheduledFor: IsoDate,
  availableFrom: IsoDateTime,
  dueAt: IsoDateTime.nullable(),
  allowLate: z.boolean(),
  maxAttempts: MaxAttempts,
  showAnswersAfterSubmit: z.boolean(),
  status: AssignmentStatus,
  maxScore: z.int().min(0),
  hasManualItems: z.boolean(),
  counts: AssignmentCounts,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AssignmentSummary = z.infer<typeof AssignmentSummary>;

export const AssignmentDetail = AssignmentSummary.extend({
  snapshot: WorksheetSnapshot,
  media: MediaMap,
});
export type AssignmentDetail = z.infer<typeof AssignmentDetail>;

export const AssignmentListQuery = PageQuery.extend({
  classId: Id.optional(),
  status: AssignmentStatus.optional(),
  worksheetId: Id.optional(),
  /** Lọc theo scheduledFor (đoạn [from, to]) — dùng cho lịch */
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});
export type AssignmentListQuery = z.infer<typeof AssignmentListQuery>;

/** Một dòng trong roster: mỗi học sinh đang ở lớp một dòng */
export const AssignmentRosterRow = z.object({
  studentId: Id,
  displayName: DisplayName,
  avatarKey: AvatarKey,
  status: RosterStatus,
  attempts: z.int().min(0),
  /** Bài tốt nhất (đã GRADED) / mới nhất */
  bestSubmissionId: Id.nullable(),
  latestSubmissionId: Id.nullable(),
  totalScore: z.number().nullable(),
  percent: z.number().min(0).max(1).nullable(),
  rank: z.int().min(1).nullable(),
  late: z.boolean(),
  submittedAt: IsoDateTime.nullable(),
  pendingManual: z.int().min(0),
});
export type AssignmentRosterRow = z.infer<typeof AssignmentRosterRow>;

export const AssignmentRosterResponse = z.object({ items: z.array(AssignmentRosterRow) });
export type AssignmentRosterResponse = z.infer<typeof AssignmentRosterResponse>;

export const AssignmentRankingEntry = z.object({
  /** RANK(): 1, 1, 3 */
  rank: z.int().min(1),
  studentId: Id,
  displayName: DisplayName,
  avatarKey: AvatarKey,
  submissionId: Id,
  totalScore: z.number(),
  maxScore: z.int().min(0),
  percent: z.number().min(0).max(1),
  durationMs: z.int().min(0).nullable(),
  submittedAt: IsoDateTime,
  attemptNo: z.int().min(1),
  isMe: z.boolean(),
});
export type AssignmentRankingEntry = z.infer<typeof AssignmentRankingEntry>;

export const AssignmentRankingResponse = z.object({
  assignmentId: Id,
  worksheetTitle: z.string(),
  classId: Id,
  className: z.string(),
  items: z.array(AssignmentRankingEntry),
  /** Dòng của người xem (học sinh), null nếu chưa có bài GRADED */
  me: AssignmentRankingEntry.nullable(),
});
export type AssignmentRankingResponse = z.infer<typeof AssignmentRankingResponse>;

// ---------- /me (học sinh) ----------
export const MyAssignmentFilter = z.enum(['open', 'upcoming', 'done', 'all']);
export type MyAssignmentFilter = z.infer<typeof MyAssignmentFilter>;

export const MyAssignmentListQuery = PageQuery.pick({ page: true, pageSize: true }).extend({
  filter: MyAssignmentFilter.default('all'),
});
export type MyAssignmentListQuery = z.infer<typeof MyAssignmentListQuery>;

export const MyAssignmentBest = z.object({
  submissionId: Id,
  status: SubmissionStatus,
  totalScore: z.number().nullable(),
  percent: z.number().min(0).max(1).nullable(),
  late: z.boolean(),
  rank: z.int().min(1).nullable(),
});
export type MyAssignmentBest = z.infer<typeof MyAssignmentBest>;

export const MyAssignmentSummary = z.object({
  id: Id,
  worksheetTitle: z.string(),
  subject: Subject,
  topic: z.string().nullable(),
  kind: WorksheetKind,
  scheduledFor: IsoDate,
  availableFrom: IsoDateTime,
  dueAt: IsoDateTime.nullable(),
  allowLate: z.boolean(),
  maxAttempts: MaxAttempts,
  showAnswersAfterSubmit: z.boolean(),
  status: AssignmentStatus,
  /** Tính tại thời điểm trả lời (status + cửa sổ thời gian) */
  isOpen: z.boolean(),
  maxScore: z.int().min(0),
  itemCount: z.int().min(0),
  hasManualItems: z.boolean(),
  attemptsUsed: z.int().min(0),
  /** Còn được bắt đầu / tiếp tục làm */
  canStart: z.boolean(),
  inProgressSubmissionId: Id.nullable(),
  best: MyAssignmentBest.nullable(),
  /** Nhận xét của GV chưa đọc (trên bài nộp mới nhất) */
  unreadComments: z.int().min(0),
});
export type MyAssignmentSummary = z.infer<typeof MyAssignmentSummary>;

export const MyAssignmentDetail = MyAssignmentSummary.extend({
  worksheet: StudentWorksheetView,
  media: MediaMap,
  submissions: z.array(SubmissionSummary),
});
export type MyAssignmentDetail = z.infer<typeof MyAssignmentDetail>;

/** Tổng quan cho dashboard giáo viên */
export const AssignmentsDashboard = z.object({
  dueToday: z.array(AssignmentSummary),
  openCount: z.int().min(0),
  pendingGrading: z.int().min(0),
  generatedAt: IsoDateTime,
});
export type AssignmentsDashboard = z.infer<typeof AssignmentsDashboard>;
