/** Giờ buổi / mốc hẹn của scheduler theo APP_TIMEZONE — hàm thuần */
import { dayjs } from '@/core/time/dayjs';

/** ISO weekday (1 = Thứ Hai … 7 = Chủ nhật) của ngày 'YYYY-MM-DD' */
export function isoWeekdayOf(date: string): number {
  return dayjs(date).isoWeekday();
}

/** Mốc bắt đầu / kết thúc của buổi `date` 'HH:mm' theo múi giờ */
export function sessionTimes(
  date: string,
  startTime: string,
  endTime: string,
  timeZone: string,
): { startsAt: Date; endsAt: Date } {
  return {
    startsAt: dayjs.tz(`${date} ${startTime}`, timeZone).toDate(),
    endsAt: dayjs.tz(`${date} ${endTime}`, timeZone).toDate(),
  };
}

/** Lần kế tiếp (sau `now`) của giờ 'HH:mm' hằng ngày theo múi giờ */
export function nextDailyAt(now: Date, time: string, timeZone: string): Date {
  const today = dayjs(now).tz(timeZone).format('YYYY-MM-DD');
  const at = dayjs.tz(`${today} ${time}`, timeZone);
  return (at.valueOf() > now.getTime() ? at : at.add(1, 'day')).toDate();
}

/** Mốc 'HH:mm' của ngày `date` đã qua chưa */
export function hasPassed(now: Date, date: string, time: string, timeZone: string): boolean {
  return dayjs.tz(`${date} ${time}`, timeZone).valueOf() <= now.getTime();
}

/** Các ngày 'YYYY-MM-DD' từ `today - days` tới `today` */
export function recentDates(today: string, days: number): string[] {
  return Array.from({ length: days + 1 }, (_, i) =>
    dayjs(today)
      .subtract(days - i, 'day')
      .format('YYYY-MM-DD'),
  );
}

/** [ngày đầu, ngày đầu tháng sau) của tháng 'YYYY-MM' */
export function monthRange(month: string): { from: string; to: string } {
  const start = dayjs(`${month}-01`);
  return { from: start.format('YYYY-MM-DD'), to: start.add(1, 'month').format('YYYY-MM-DD') };
}

/** Các ngày 'YYYY-MM-DD' từ `from` tới `to` (cả hai đầu) */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = dayjs(from); d.format('YYYY-MM-DD') <= to; d = d.add(1, 'day'))
    out.push(d.format('YYYY-MM-DD'));
  return out;
}

/** Ngày lịch của ca: [startsOn, endsOn) — null là không giới hạn đầu đó */
export interface SlotDates {
  startsOn: string | null;
  endsOn: string | null;
}

/** Ca còn có buổi vào ngày `date` không (chưa xét thứ trong tuần) */
export function slotRunsOn(slot: SlotDates, date: string): boolean {
  return (!slot.startsOn || slot.startsOn <= date) && (!slot.endsOn || date < slot.endsOn);
}

/**
 * Ngày có buổi kế tiếp của ca tính từ `from` (gồm cả `from`): đúng thứ, trong [startsOn, endsOn), bỏ các ngày `skip`
 * (đã huỷ trước). Tìm trong `weeks` tuần, không thấy → null.
 */
export function nextSessionDate(
  slot: SlotDates & { weekday: number },
  from: string,
  skip: ReadonlySet<string> = new Set(),
  weeks = 12,
): string | null {
  const start = slot.startsOn && slot.startsOn > from ? slot.startsOn : from;
  let d = dayjs(start).add((slot.weekday - dayjs(start).isoWeekday() + 7) % 7, 'day');
  for (let i = 0; i < weeks; i += 1, d = d.add(7, 'day')) {
    const date = d.format('YYYY-MM-DD');
    if (slot.endsOn && date >= slot.endsOn) return null;
    if (!skip.has(date)) return date;
  }
  return null;
}
