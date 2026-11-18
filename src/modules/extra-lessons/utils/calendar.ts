/** Buổi dự kiến trên lịch (docs/attendance-calendar-design.md §3) — hàm thuần */
import { isActiveOn } from '@/modules/extra-lessons/utils/schedule';
import { isoWeekdayOf } from '@/modules/extra-lessons/utils/session-time';

export interface CalendarSlot {
  id: string;
  weekday: number;
  startsOn: string | null;
  endsOn: string | null;
}

export interface CalendarAssignment {
  slotId: string;
  studentId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface PlannedOccurrence {
  date: string;
  slotId: string;
  studentCount: number;
  /** Học sinh có lịch kết thúc (học có thời hạn) */
  limitedCount: number;
}

/** Ca có buổi vào ngày `date`: đúng thứ, trong [startsOn, endsOn) */
export function slotRunsOn(slot: CalendarSlot, date: string): boolean {
  return (
    slot.weekday === isoWeekdayOf(date) &&
    (slot.startsOn === null || slot.startsOn <= date) &&
    (slot.endsOn === null || date < slot.endsOn)
  );
}

/**
 * Buổi dự kiến của các ngày `dates` (người gọi chỉ truyền ngày ≥ hôm nay): ca chạy ngày đó, chưa có buổi thật
 * (`existing` chứa `slotId:date`), có ít nhất một học sinh theo lịch — giống luật tạo buổi 00:05.
 * `assignments` chỉ gồm học sinh ACTIVE. Kết quả theo thứ tự `dates` rồi `slots`.
 */
export function plannedOccurrences(
  dates: readonly string[],
  slots: readonly CalendarSlot[],
  assignments: readonly CalendarAssignment[],
  existing: ReadonlySet<string>,
): PlannedOccurrence[] {
  const bySlot = new Map<string, CalendarAssignment[]>();
  for (const a of assignments) bySlot.set(a.slotId, [...(bySlot.get(a.slotId) ?? []), a]);
  const out: PlannedOccurrence[] = [];
  for (const date of dates) {
    for (const slot of slots) {
      if (!slotRunsOn(slot, date) || existing.has(`${slot.id}:${date}`)) continue;
      const students = new Set<string>();
      const limited = new Set<string>();
      for (const a of bySlot.get(slot.id) ?? []) {
        if (!isActiveOn({ from: a.effectiveFrom, to: a.effectiveTo }, date)) continue;
        students.add(a.studentId);
        if (a.effectiveTo !== null) limited.add(a.studentId);
      }
      if (students.size === 0) continue;
      out.push({ date, slotId: slot.id, studentCount: students.size, limitedCount: limited.size });
    }
  }
  return out;
}
