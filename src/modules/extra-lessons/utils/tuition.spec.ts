import { describe, expect, it } from 'vitest';
import { fillMonths, monthsBetween, monthsDateRange, sumMonths } from '@/modules/extra-lessons/utils/tuition';

describe('tuition utils', () => {
  it('monthsBetween: qua năm, cả hai đầu', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-03', '2026-03')).toEqual(['2026-03']);
  });

  it('monthsDateRange: nửa mở tới đầu tháng sau', () => {
    expect(monthsDateRange('2026-01', '2026-12')).toEqual({ from: '2026-01-01', to: '2027-01-01' });
  });

  it('fillMonths điền 0 cho tháng trống; sumMonths cộng dồn', () => {
    const row = {
      month: '2026-10',
      confirmedTotal: 200_000,
      pendingTotal: 100_000,
      chargedCount: 3,
      presentCount: 3,
      absentCount: 1,
      excusedCount: 0,
      studentCount: 2,
    };
    const months = fillMonths('2026-09', '2026-11', [row]);
    expect(months.map((m) => m.confirmedTotal)).toEqual([0, 200_000, 0]);
    expect(months[0]).toMatchObject({ month: '2026-09', studentCount: 0 });
    expect(sumMonths([...months, row], 2)).toMatchObject({
      confirmedTotal: 400_000,
      pendingTotal: 200_000,
      chargedCount: 6,
      absentCount: 2,
      studentCount: 2,
    });
  });
});
