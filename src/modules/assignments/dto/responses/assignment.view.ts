/** Dựng view (đúng shape contracts) từ dòng Prisma — hàm thuần, không truy vấn DB */
import {
  type AssignmentCounts,
  type AssignmentRosterRow,
  type AssignmentSummary,
  AvatarKey,
  DEFAULT_AVATAR,
  type MyAssignmentSummary,
  type RosterStatus,
  type SubmissionStatus,
  type WorksheetSnapshot,
} from '@phonics/contracts';
import { maxBy } from 'es-toolkit';
import { itemsOf } from '@/modules/worksheets/utils/worksheet-snapshot';
import { type AssignmentRow } from '@/modules/assignments/types/assignment.types';
import { isOpenFor, isoDateOf } from '@/modules/assignments/utils/assignment-dates';

export const EMPTY_COUNTS: AssignmentCounts = {
  students: 0,
  submitted: 0,
  graded: 0,
  missing: 0,
  pendingGrading: 0,
  avgPercent: null,
};

export function toAssignmentSummary(
  row: AssignmentRow,
  counts: AssignmentCounts = EMPTY_COUNTS,
): AssignmentSummary {
  return {
    id: row.id,
    worksheetId: row.worksheetId,
    worksheetTitle: row.worksheet.title,
    subject: row.worksheet.subject,
    topic: row.worksheet.topic,
    kind: row.worksheet.kind,
    classId: row.classId,
    className: row.class.name,
    assignedById: row.assignedById,
    assignedByName: row.assignedBy.displayName,
    scheduledFor: isoDateOf(row.scheduledFor),
    availableFrom: row.availableFrom.toISOString(),
    dueAt: row.dueAt?.toISOString() ?? null,
    allowLate: row.allowLate,
    maxAttempts: row.maxAttempts,
    showAnswersAfterSubmit: row.showAnswersAfterSubmit,
    status: row.status,
    maxScore: row.maxScore,
    hasManualItems: row.hasManualItems,
    counts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Ảnh chụp trường có thể sửa của bài giao (before / after cho audit log) */
export function toAssignmentAudit(row: AssignmentRow): Record<string, unknown> {
  return {
    scheduledFor: isoDateOf(row.scheduledFor),
    availableFrom: row.availableFrom.toISOString(),
    dueAt: row.dueAt?.toISOString() ?? null,
    allowLate: row.allowLate,
    maxAttempts: row.maxAttempts,
    showAnswersAfterSubmit: row.showAnswersAfterSubmit,
    status: row.status,
  };
}

// ---------- Roster (GV) ----------

export interface RosterMember {
  studentId: string;
  student: { user: { displayName: string; avatarKey: string } };
}

export interface RosterSubmission {
  id: string;
  studentId: string;
  status: SubmissionStatus;
  attemptNo: number;
  totalScore: number | null;
  maxScore: number;
  late: boolean;
  submittedAt: Date | null;
  /** Câu chấm tay chưa có điểm */
  answers: { id: string }[];
}

/** Một học sinh trong roster: lần làm mới nhất + bài tốt nhất đã chấm + hạng */
export function toRosterRow(
  member: RosterMember,
  submissions: readonly RosterSubmission[],
  rank: number | null,
): AssignmentRosterRow {
  const latest = submissions.at(-1);
  const graded = submissions.filter((s) => s.status === 'GRADED' && s.totalScore !== null);
  const best = maxBy(graded, (s) => s.totalScore ?? 0);
  const status: RosterStatus = latest ? latest.status : 'MISSING';
  return {
    studentId: member.studentId,
    displayName: member.student.user.displayName,
    avatarKey: AvatarKey.safeParse(member.student.user.avatarKey).data ?? DEFAULT_AVATAR,
    status,
    attempts: submissions.length,
    bestSubmissionId: best?.id ?? null,
    latestSubmissionId: latest?.id ?? null,
    totalScore: best?.totalScore ?? null,
    percent: best && best.maxScore > 0 ? Math.min(1, (best.totalScore ?? 0) / best.maxScore) : null,
    rank,
    late: latest?.late ?? false,
    submittedAt: latest?.submittedAt?.toISOString() ?? null,
    pendingManual: latest?.status === 'SUBMITTED' ? latest.answers.length : 0,
  };
}

// ---------- Học sinh ----------

export interface MySubmissionBrief {
  id: string;
  assignmentId: string;
  status: SubmissionStatus;
  totalScore: number | null;
  maxScore: number;
  late: boolean;
  /** Nhận xét gốc của GV mà bé chưa trả lời */
  comments: { id: string }[];
}

/** Bài giao nhìn từ học sinh: còn được làm không, lần làm dở, bài tốt nhất, nhận xét chưa đọc */
export function toMyAssignmentSummary(
  row: AssignmentRow,
  mine: readonly MySubmissionBrief[],
  rank: number | null,
  now: Date,
): MyAssignmentSummary {
  const inProgress = mine.find((s) => s.status === 'IN_PROGRESS');
  const finished = mine.filter((s) => s.status !== 'IN_PROGRESS');
  const best = maxBy(finished, (s) => s.totalScore ?? -1);
  const latest = mine.at(-1);
  const open = isOpenFor(row, now);
  const snapshot = row.snapshot as unknown as WorksheetSnapshot;
  return {
    id: row.id,
    worksheetTitle: row.worksheet.title,
    subject: row.worksheet.subject,
    topic: row.worksheet.topic,
    kind: row.worksheet.kind,
    scheduledFor: isoDateOf(row.scheduledFor),
    availableFrom: row.availableFrom.toISOString(),
    dueAt: row.dueAt?.toISOString() ?? null,
    allowLate: row.allowLate,
    maxAttempts: row.maxAttempts,
    showAnswersAfterSubmit: row.showAnswersAfterSubmit,
    status: row.status,
    isOpen: open,
    maxScore: row.maxScore,
    itemCount: itemsOf(snapshot).length,
    hasManualItems: row.hasManualItems,
    attemptsUsed: mine.length,
    canStart: open && (!!inProgress || mine.length < row.maxAttempts),
    inProgressSubmissionId: inProgress?.id ?? null,
    best: best
      ? {
          submissionId: best.id,
          status: best.status,
          totalScore: best.totalScore,
          percent:
            best.maxScore > 0 && best.totalScore !== null
              ? Math.min(1, best.totalScore / best.maxScore)
              : null,
          late: best.late,
          rank,
        }
      : null,
    unreadComments: latest?.comments.length ?? 0,
  };
}
