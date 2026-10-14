import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// Nạp plugin một lần cho cả API; mọi nơi import `dayjs` từ đây (không import thẳng 'dayjs').
// `timezone` nạp sau `isoWeek` để `.tz(...).startOf('isoWeek')` tính theo múi giờ.
dayjs.extend(utc);
dayjs.extend(isoWeek);
dayjs.extend(duration);
dayjs.extend(timezone);

export { dayjs };
export type { ConfigType, Dayjs } from 'dayjs';
export type { DurationUnitType } from 'dayjs/plugin/duration';

/** Định dạng cột DATE / query `from`, `to` */
export const ISO_DATE = 'YYYY-MM-DD';

/** Mốc biên cho khoảng "không giới hạn" khi SQL cần [from, to) cụ thể */
export const EPOCH = new Date(0);
export const FAR_FUTURE = new Date('2100-01-01T00:00:00Z');
