/** Giải đơn giá (docs/attendance-design.md §4.1) và cách ghi dòng giá mới — hàm thuần */
import { type AppliedRate } from '@phonics/contracts';
import { isActiveOn } from '@/modules/extra-lessons/utils/schedule';

export interface RateRow {
  id: string;
  studentId: string | null;
  slotId: string | null;
  pricePerSession: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * Dòng hiệu lực tại `date` theo ưu tiên: (HS, ca) → (HS, mọi ca) → (mặc định ca) → chưa có (0đ, `NONE`).
 * `slotId` null (buổi bù) bỏ qua bước 1 và 3. `rates` có thể lẫn mọi phạm vi — hàm tự lọc.
 */
export function resolveRate(
  rates: readonly RateRow[],
  studentId: string,
  slotId: string | null,
  date: string,
): AppliedRate {
  const active = (r: RateRow) => isActiveOn({ from: r.effectiveFrom, to: r.effectiveTo }, date);
  const steps: { source: AppliedRate['source']; match: (r: RateRow) => boolean }[] = [
    { source: 'STUDENT_SLOT', match: (r) => !!slotId && r.studentId === studentId && r.slotId === slotId },
    { source: 'STUDENT', match: (r) => r.studentId === studentId && r.slotId === null },
    { source: 'SLOT', match: (r) => !!slotId && r.studentId === null && r.slotId === slotId },
  ];
  for (const step of steps) {
    const row = rates.find((r) => step.match(r) && active(r));
    if (row) {
      return {
        pricePerSession: row.pricePerSession,
        source: step.source,
        rateId: row.id,
        effectiveTo: row.effectiveTo,
      };
    }
  }
  return { pricePerSession: 0, source: 'NONE', rateId: null, effectiveTo: null };
}

/**
 * Thêm giá mới cùng phạm vi từ ngày `from` (tới trước `to`, không có = mở): dòng đang phủ ngày `from` bị đóng tại `from`;
 * dòng bắt đầu trong [from, to) bị thay thế (effective_to = effective_from → không còn ngày hiệu lực). Dòng bắt đầu từ
 * `to` trở đi giữ nguyên. Hết `to` thì về mức giá kế tiếp (giá chung / giá ca), không mở lại dòng cũ.
 */
export function planRateInsert(
  sameScope: readonly Pick<RateRow, 'id' | 'effectiveFrom' | 'effectiveTo'>[],
  from: string,
  to: string | null = null,
): { id: string; effectiveTo: string }[] {
  const changes: { id: string; effectiveTo: string }[] = [];
  for (const row of sameScope) {
    if (row.effectiveTo !== null && row.effectiveTo <= from) continue; // kết thúc trước ngày mới
    if (to !== null && row.effectiveFrom >= to) continue; // bắt đầu sau khi ưu đãi hết
    if (row.effectiveFrom >= from) {
      if (row.effectiveTo !== row.effectiveFrom) changes.push({ id: row.id, effectiveTo: row.effectiveFrom });
    } else {
      changes.push({ id: row.id, effectiveTo: from });
    }
  }
  return changes;
}
