import { describe, expect, it } from 'vitest';
import { dateOnly, isOpenFor, isoDateOf, statusByWindow } from './assignment-dates';

describe('isOpenFor', () => {
  const base = {
    status: 'OPEN' as const,
    availableFrom: new Date('2026-10-09T00:00:00Z'),
    dueAt: new Date('2026-10-10T00:00:00Z'),
    allowLate: false,
  };
  it('ma trận trạng thái / cửa sổ thời gian', () => {
    expect(isOpenFor(base, new Date('2026-10-09T08:00:00Z'))).toBe(true);
    expect(isOpenFor(base, new Date('2026-10-08T08:00:00Z'))).toBe(false);
    expect(isOpenFor(base, new Date('2026-10-11T08:00:00Z'))).toBe(false);
    expect(isOpenFor({ ...base, allowLate: true }, new Date('2026-10-11T08:00:00Z'))).toBe(true);
    expect(isOpenFor({ ...base, dueAt: null }, new Date('2027-01-01T00:00:00Z'))).toBe(true);
    expect(isOpenFor({ ...base, status: 'SCHEDULED' }, new Date('2026-10-09T08:00:00Z'))).toBe(false);
    expect(isOpenFor({ ...base, status: 'CLOSED' }, new Date('2026-10-09T08:00:00Z'))).toBe(false);
  });
  it('dateOnly / isoDateOf đi vòng', () => {
    expect(isoDateOf(dateOnly('2026-10-09'))).toBe('2026-10-09');
  });
});

describe('statusByWindow', () => {
  it('tới giờ mở → OPEN, chưa tới → SCHEDULED', () => {
    const at = new Date('2026-10-09T08:00:00Z');
    expect(statusByWindow(new Date('2026-10-09T07:00:00Z'), at)).toBe('OPEN');
    expect(statusByWindow(at, at)).toBe('OPEN');
    expect(statusByWindow(new Date('2026-10-09T09:00:00Z'), at)).toBe('SCHEDULED');
  });
});
