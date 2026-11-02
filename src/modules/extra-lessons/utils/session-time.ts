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
