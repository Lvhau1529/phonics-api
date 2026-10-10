import { describe, expect, it } from 'vitest';
import {
  avg,
  bestGraded,
  distributePercents,
  isPastDue,
  percentOf,
  toWeekBucket,
} from './worksheet-stats.math';

const sub = (totalScore: number | null, status: 'GRADED' | 'SUBMITTED' = 'GRADED') => ({
  id: String(totalScore),
  assignmentId: 'a1',
  studentId: 's1',
  status,
  late: false,
  totalScore,
  maxScore: 10,
});

describe('worksheet-stats.math', () => {
  it('distributePercents: biên bucket và giá trị ngoài [0, 1]', () => {
    const counts = distributePercents([0, 0.2, 0.21, 0.6, 0.805, 1, 1.5, -1]).map((b) => b.count);
    expect(counts).toEqual([3, 1, 1, 0, 3]);
  });

  it('avg / percentOf', () => {
    expect(avg([])).toBeNull();
    expect(avg([0.5, 1])).toBe(0.75);
    expect(percentOf(null, 10)).toBeNull();
    expect(percentOf(12, 10)).toBe(1);
    expect(percentOf(5, 0)).toBeNull();
  });

  it('bestGraded: chỉ xét bài GRADED có điểm, lấy điểm cao nhất', () => {
    expect(bestGraded([sub(9, 'SUBMITTED'), sub(4), sub(7)])?.totalScore).toBe(7);
    expect(bestGraded([sub(null), sub(3, 'SUBMITTED')])).toBeUndefined();
  });

  it('isPastDue: CLOSED hoặc quá hạn mà không cho nộp muộn', () => {
    const now = new Date('2026-10-09T00:00:00Z');
    const past = new Date('2026-10-08T00:00:00Z');
    expect(isPastDue({ id: 'a', status: 'CLOSED', dueAt: null, allowLate: false }, now)).toBe(true);
    expect(isPastDue({ id: 'a', status: 'OPEN', dueAt: past, allowLate: false }, now)).toBe(true);
    expect(isPastDue({ id: 'a', status: 'OPEN', dueAt: past, allowLate: true }, now)).toBe(false);
    expect(isPastDue({ id: 'a', status: 'OPEN', dueAt: null, allowLate: false }, now)).toBe(false);
  });

  it('toWeekBucket: kẹp avgPercent vào [0, 1], giữ null', () => {
    expect(
      toWeekBucket({ weekStart: '2026-10-05', assignments: 1, submissions: 2, avgPercent: 1.2 }).avgPercent,
    ).toBe(1);
    expect(
      toWeekBucket({ weekStart: '2026-10-05', assignments: 1, submissions: 0, avgPercent: null }).avgPercent,
    ).toBeNull();
  });
});
