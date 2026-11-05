/** Khoảng ngày nửa mở [from, to) trên chuỗi 'YYYY-MM-DD' (so sánh chuỗi = so sánh ngày) — hàm thuần */

export interface DateRange {
  from: string;
  /** null = không giới hạn */
  to: string | null;
}

/** Ngày `date` nằm trong [from, to) */
export function isActiveOn(range: DateRange, date: string): boolean {
  return range.from <= date && (range.to === null || date < range.to);
}

/** Hai khoảng [a.from, a.to) và [b.from, b.to) có ngày chung */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return (a.to === null || b.from < a.to) && (b.to === null || a.from < b.to);
}
