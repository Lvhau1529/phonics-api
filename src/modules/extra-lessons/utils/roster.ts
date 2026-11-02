/** Đồng bộ danh sách học sinh của buổi với lịch (§6.1) — hàm thuần */
import { BILLING_POLICY, type AttendanceMark } from '@phonics/contracts';
import { isActiveOn } from '@/modules/extra-lessons/utils/schedule';

export interface RosterRecord {
  studentId: string;
  source: string;
  mark: AttendanceMark;
  charged: boolean;
}

/**
 * Học sinh có trong buổi `(slotId, date)` theo lịch không: có dòng lịch của ca đó hiệu lực tại ngày.
 * `assignments` là các dòng của một học sinh (mọi ca).
 */
export function expectedInSession(
  assignments: readonly { slotId: string; effectiveFrom: string; effectiveTo: string | null }[],
  slotId: string | null,
  date: string,
): boolean {
  if (!slotId) return false;
  return assignments.some(
    (a) => a.slotId === slotId && isActiveOn({ from: a.effectiveFrom, to: a.effectiveTo }, date),
  );
}

/**
 * Thay đổi cần làm với một học sinh ở một buổi: ADD khi theo lịch phải có mà chưa có bản ghi nào; REMOVE khi không còn
 * theo lịch mà đang có bản ghi SNAPSHOT (bản ghi MANUAL — GV thêm tay — giữ nguyên).
 */
export function rosterChange(
  expected: boolean,
  record: Pick<RosterRecord, 'source'> | undefined,
): 'ADD' | 'REMOVE' | null {
  if (expected && !record) return 'ADD';
  if (!expected && record?.source === 'SNAPSHOT') return 'REMOVE';
  return null;
}

/** Số có mặt */
export function presentCountOf(records: readonly Pick<RosterRecord, 'mark'>[]): number {
  return records.filter((r) => r.mark === 'PRESENT').length;
}

/** `charged` sau khi đổi điểm danh: theo BILLING_POLICY trừ khi admin gửi giá trị riêng */
export function chargedAfter(mark: AttendanceMark, explicit: boolean | undefined): boolean {
  return explicit ?? BILLING_POLICY[mark];
}
