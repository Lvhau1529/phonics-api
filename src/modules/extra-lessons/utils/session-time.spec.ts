import { describe, expect, it } from 'vitest';
import { expectedInSession, presentCountOf, rosterChange } from '@/modules/extra-lessons/utils/roster';
import {
  hasPassed,
  isoWeekdayOf,
  monthRange,
  nextDailyAt,
  recentDates,
  sessionTimes,
} from '@/modules/extra-lessons/utils/session-time';

const TZ = 'Asia/Ho_Chi_Minh';

describe('session-time', () => {
  it('thứ ISO và giờ buổi theo múi giờ', () => {
    expect(isoWeekdayOf('2026-11-03')).toBe(2); // Thứ Ba
    expect(isoWeekdayOf('2026-11-08')).toBe(7); // Chủ nhật
    expect(sessionTimes('2026-11-03', '18:00', '19:30', TZ)).toEqual({
      startsAt: new Date('2026-11-03T11:00:00Z'),
      endsAt: new Date('2026-11-03T12:30:00Z'),
    });
  });

  it('mốc kế tiếp hằng ngày', () => {
    // 20:59 giờ VN → 21:00 cùng ngày; 21:00 đúng → hôm sau
    expect(nextDailyAt(new Date('2026-11-03T13:59:00Z'), '21:00', TZ)).toEqual(
      new Date('2026-11-03T14:00:00Z'),
    );
    expect(nextDailyAt(new Date('2026-11-03T14:00:00Z'), '21:00', TZ)).toEqual(
      new Date('2026-11-04T14:00:00Z'),
    );
    expect(hasPassed(new Date('2026-11-03T14:00:00Z'), '2026-11-03', '21:00', TZ)).toBe(true);
    expect(hasPassed(new Date('2026-11-02T17:04:00Z'), '2026-11-03', '00:05', TZ)).toBe(false);
  });

  it('ngày gần đây, khoảng tháng', () => {
    expect(recentDates('2026-11-02', 2)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('roster', () => {
  const rows = [{ slotId: 'a', effectiveFrom: '2026-10-01', effectiveTo: '2026-11-01' }];

  it('theo lịch tại ngày', () => {
    expect(expectedInSession(rows, 'a', '2026-10-31')).toBe(true);
    expect(expectedInSession(rows, 'a', '2026-11-01')).toBe(false);
    expect(expectedInSession(rows, 'b', '2026-10-15')).toBe(false);
    expect(expectedInSession(rows, null, '2026-10-15')).toBe(false);
  });

  it('thêm / bỏ, giữ bản ghi MANUAL', () => {
    expect(rosterChange(true, undefined)).toBe('ADD');
    expect(rosterChange(true, { source: 'SNAPSHOT' })).toBeNull();
    expect(rosterChange(false, { source: 'SNAPSHOT' })).toBe('REMOVE');
    expect(rosterChange(false, { source: 'MANUAL' })).toBeNull();
    expect(presentCountOf([{ mark: 'PRESENT' }, { mark: 'ABSENT' }, { mark: 'PRESENT' }])).toBe(2);
  });
});
