import { describe, expect, it } from 'vitest';
import { expectedInSession, presentCountOf, rosterChange } from '@/modules/extra-lessons/utils/roster';
import {
  datesBetween,
  hasPassed,
  isoWeekdayOf,
  monthRange,
  nextDailyAt,
  nextSessionDate,
  recentDates,
  sessionTimes,
  slotRunsOn,
} from '@/modules/extra-lessons/utils/session-time';

const TZ = 'Asia/Ho_Chi_Minh';

describe('ngày lịch của ca', () => {
  // 2026-11-03 là Thứ Ba
  const tue = { weekday: 2, startsOn: null, endsOn: null };

  it('datesBetween gồm cả hai đầu', () => {
    expect(datesBetween('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']);
    expect(datesBetween('2026-11-03', '2026-11-03')).toEqual(['2026-11-03']);
  });

  it('slotRunsOn theo [startsOn, endsOn)', () => {
    const slot = { startsOn: '2026-11-10', endsOn: '2026-12-01' };
    expect(slotRunsOn(slot, '2026-11-09')).toBe(false);
    expect(slotRunsOn(slot, '2026-11-10')).toBe(true);
    expect(slotRunsOn(slot, '2026-11-30')).toBe(true);
    expect(slotRunsOn(slot, '2026-12-01')).toBe(false);
    expect(slotRunsOn({ startsOn: null, endsOn: null }, '2030-01-01')).toBe(true);
  });

  it('nextSessionDate: hôm nay đúng thứ thì là hôm nay; bỏ ngày đã huỷ; tôn trọng ngày bắt đầu / ngừng', () => {
    expect(nextSessionDate(tue, '2026-11-03')).toBe('2026-11-03');
    expect(nextSessionDate(tue, '2026-11-04')).toBe('2026-11-10');
    expect(nextSessionDate(tue, '2026-11-03', new Set(['2026-11-03', '2026-11-10']))).toBe('2026-11-17');
    expect(nextSessionDate({ ...tue, startsOn: '2026-11-20' }, '2026-11-03')).toBe('2026-11-24');
    expect(nextSessionDate({ ...tue, endsOn: '2026-11-10' }, '2026-11-04')).toBeNull();
    expect(nextSessionDate({ weekday: 7, startsOn: null, endsOn: null }, '2026-11-03')).toBe('2026-11-08');
  });
});

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
