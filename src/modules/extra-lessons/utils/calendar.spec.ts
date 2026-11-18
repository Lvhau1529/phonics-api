import { describe, expect, it } from 'vitest';
import { plannedOccurrences, slotRunsOn } from '@/modules/extra-lessons/utils/calendar';

// 2026-11-20 là Thứ Sáu (5), 2026-11-27 Thứ Sáu tuần sau
const fri = { id: 'fri', weekday: 5, startsOn: null, endsOn: null };
const tue = { id: 'tue', weekday: 2, startsOn: null, endsOn: null };

describe('slotRunsOn', () => {
  it('đúng thứ, trong [startsOn, endsOn)', () => {
    expect(slotRunsOn(fri, '2026-11-20')).toBe(true);
    expect(slotRunsOn(fri, '2026-11-19')).toBe(false);
    expect(slotRunsOn({ ...fri, startsOn: '2026-11-21' }, '2026-11-20')).toBe(false);
    expect(slotRunsOn({ ...fri, endsOn: '2026-11-20' }, '2026-11-20')).toBe(false);
    expect(slotRunsOn({ ...fri, endsOn: '2026-11-21' }, '2026-11-20')).toBe(true);
  });
});

describe('plannedOccurrences', () => {
  const dates = ['2026-11-17', '2026-11-20', '2026-11-27'];

  it('đếm học sinh có lịch tại ngày, tách học sinh có thời hạn', () => {
    const result = plannedOccurrences(
      dates,
      [fri, tue],
      [
        { slotId: 'fri', studentId: 'a', effectiveFrom: '2026-09-01', effectiveTo: null },
        // Tăng cường: học đến hết 20/11
        { slotId: 'fri', studentId: 'b', effectiveFrom: '2026-11-15', effectiveTo: '2026-11-21' },
        { slotId: 'tue', studentId: 'a', effectiveFrom: '2026-09-01', effectiveTo: null },
      ],
      new Set(),
    );
    expect(result).toEqual([
      { date: '2026-11-17', slotId: 'tue', studentCount: 1, limitedCount: 0 },
      { date: '2026-11-20', slotId: 'fri', studentCount: 2, limitedCount: 1 },
      { date: '2026-11-27', slotId: 'fri', studentCount: 1, limitedCount: 0 },
    ]);
  });

  it('bỏ ca đã có buổi thật (kể cả huỷ trước) và ca không còn học sinh', () => {
    const result = plannedOccurrences(
      dates,
      [fri, tue],
      [{ slotId: 'fri', studentId: 'a', effectiveFrom: '2026-09-01', effectiveTo: '2026-11-27' }],
      new Set(['fri:2026-11-20']),
    );
    expect(result).toEqual([]);
  });

  it('một học sinh hai dòng lịch liền nhau chỉ đếm một lần', () => {
    const result = plannedOccurrences(
      ['2026-11-20'],
      [fri],
      [
        { slotId: 'fri', studentId: 'a', effectiveFrom: '2026-09-01', effectiveTo: '2026-11-20' },
        { slotId: 'fri', studentId: 'a', effectiveFrom: '2026-11-20', effectiveTo: null },
      ],
      new Set(),
    );
    expect(result).toEqual([{ date: '2026-11-20', slotId: 'fri', studentCount: 1, limitedCount: 0 }]);
  });
});
