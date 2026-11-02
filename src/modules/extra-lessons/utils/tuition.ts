/** Gom số liệu học phí theo tháng — hàm thuần */
import { type TuitionMonth } from '@phonics/contracts';
import { dayjs } from '@/core/time/dayjs';
import { type TuitionAgg } from '@/modules/extra-lessons/repositories/tuition.repository';

export const EMPTY_AGG: TuitionAgg = {
  confirmedTotal: 0,
  pendingTotal: 0,
  chargedCount: 0,
  presentCount: 0,
  absentCount: 0,
  excusedCount: 0,
  studentCount: 0,
};

/** Các tháng 'YYYY-MM' từ `from` tới `to` (cả hai đầu) */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = dayjs(`${from}-01`); m.format('YYYY-MM') <= to; m = m.add(1, 'month'))
    out.push(m.format('YYYY-MM'));
  return out;
}

/** Khoảng ngày nửa mở của khoảng tháng [from, to] */
export function monthsDateRange(from: string, to: string): { from: string; to: string } {
  return { from: `${from}-01`, to: dayjs(`${to}-01`).add(1, 'month').format('YYYY-MM-DD') };
}

/** Đủ mọi tháng trong khoảng (tháng không có dữ liệu = 0) */
export function fillMonths(
  from: string,
  to: string,
  rows: readonly (TuitionAgg & { month: string })[],
): TuitionMonth[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthsBetween(from, to).map((month) => ({ ...EMPTY_AGG, ...byMonth.get(month), month }));
}

/** Tổng của cả khoảng — số học sinh là số học sinh khác nhau, tính riêng (`studentCount`) */
export function sumMonths(months: readonly TuitionAgg[], studentCount: number): TuitionAgg {
  const total = { ...EMPTY_AGG };
  for (const m of months) {
    total.confirmedTotal += m.confirmedTotal;
    total.pendingTotal += m.pendingTotal;
    total.chargedCount += m.chargedCount;
    total.presentCount += m.presentCount;
    total.absentCount += m.absentCount;
    total.excusedCount += m.excusedCount;
  }
  return { ...total, studentCount };
}
