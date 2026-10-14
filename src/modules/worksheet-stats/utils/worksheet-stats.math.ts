/** Phép tính thuần cho thống kê phiếu (không truy vấn DB) */
import { type ScoreBucket, type TypeAccuracy, type WeekBucket } from '@phonics/contracts';
import { clamp, maxBy, mean } from 'es-toolkit';
import {
  type AssignmentBrief,
  type SubmissionBrief,
  type TypeRow,
  type WeekRow,
} from '@/modules/worksheet-stats/types/worksheet-stats.types';

const BUCKETS: readonly { label: string; from: number; to: number }[] = [
  { label: '0-20', from: 0, to: 20 },
  { label: '21-40', from: 21, to: 40 },
  { label: '41-60', from: 41, to: 60 },
  { label: '61-80', from: 61, to: 80 },
  { label: '81-100', from: 81, to: 100 },
];

/** Gom phần trăm (0..1) vào 5 bucket cố định */
export function distributePercents(percents: readonly number[]): ScoreBucket[] {
  const out = BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const p of percents) {
    const pct = Math.round(clamp(p, 0, 1) * 100);
    const idx = out.findIndex((b) => pct >= b.from && pct <= b.to);
    out[idx === -1 ? 0 : idx].count += 1;
  }
  return out;
}

export const avg = (xs: readonly number[]): number | null => (xs.length ? mean(xs) : null);

/** Bài đã đóng, hoặc quá hạn mà không cho nộp muộn — tính vào "lẽ ra phải nộp" */
export const isPastDue = (a: AssignmentBrief, now: Date): boolean =>
  a.status === 'CLOSED' || (!!a.dueAt && a.dueAt < now && !a.allowLate);

/** Bài GRADED điểm cao nhất trong các lần làm */
export const bestGraded = <S extends SubmissionBrief>(list: readonly S[]): S | undefined =>
  maxBy(
    list.filter((s) => s.status === 'GRADED' && s.totalScore !== null),
    (s) => s.totalScore ?? 0,
  );

export const percentOf = (score: number | null, max: number): number | null =>
  score !== null && max > 0 ? Math.min(1, score / max) : null;

export function toTypeAccuracy(r: TypeRow): TypeAccuracy {
  return {
    type: r.type,
    answered: r.answered,
    correct: r.correct,
    accuracy: r.answered > 0 ? r.correct / r.answered : 0,
    avgScoreRatio: clamp(r.avgScoreRatio ?? 0, 0, 1),
  };
}

export function toWeekBucket(r: WeekRow): WeekBucket {
  return {
    weekStart: r.weekStart,
    assignments: r.assignments,
    submissions: r.submissions,
    avgPercent: r.avgPercent === null ? null : clamp(r.avgPercent, 0, 1),
  };
}
