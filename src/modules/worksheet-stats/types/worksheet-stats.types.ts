import { type QuestionType, type SubmissionStatus } from '@phonics/contracts';

/** Một dòng độ chính xác theo dạng câu (SQL) */
export interface TypeRow {
  type: QuestionType;
  answered: number;
  correct: number;
  avgScoreRatio: number | null;
}

/** Một dòng điểm theo tuần (SQL) */
export interface WeekRow {
  weekStart: string;
  assignments: number;
  submissions: number;
  avgPercent: number | null;
}

/** Thống kê một câu của bài giao (trên lần nộp mới nhất của mỗi học sinh) */
export interface ItemRow {
  worksheetItemId: string;
  answered: number;
  correct: number;
  avgScore: number | null;
}

/** Bài nộp rút gọn để tính tỉ lệ / bài tốt nhất */
export interface SubmissionBrief {
  id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  late: boolean;
  totalScore: number | null;
  maxScore: number;
}

/** Bài giao rút gọn để tính bỏ lỡ / hoàn thành */
export interface AssignmentBrief {
  id: string;
  status: 'SCHEDULED' | 'OPEN' | 'CLOSED';
  dueAt: Date | null;
  allowLate: boolean;
}
