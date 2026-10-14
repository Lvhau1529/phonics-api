import { Inject, Injectable } from '@nestjs/common';
import { type RangeQuery } from '@phonics/contracts';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { type ConfigType, dayjs, type Dayjs, FAR_FUTURE, EPOCH, ISO_DATE } from '@/core/time/dayjs';

export interface DateRange {
  from: Date;
  /** Không bao gồm (`< to`) */
  to: Date;
}

/** Mọi phép "hôm nay / tuần này / tháng này" tính theo APP_TIMEZONE (không phải UTC của server), bằng dayjs.tz */
@Injectable()
export class TimeService {
  readonly timeZone: string;

  constructor(@Inject(ENV) env: Env) {
    this.timeZone = env.APP_TIMEZONE;
  }

  /** `date` nhìn theo APP_TIMEZONE */
  at(date: ConfigType = new Date()): Dayjs {
    return dayjs(date).tz(this.timeZone);
  }

  /** Định dạng theo APP_TIMEZONE, vd `format(d, 'DD/MM/YYYY HH:mm')` */
  format(date: ConfigType, pattern: string): string {
    return this.at(date).format(pattern);
  }

  startOfDay(date: Date): Date {
    return this.at(date).startOf('day').toDate();
  }

  /** Thứ Hai đầu tuần */
  startOfWeek(date: Date): Date {
    return this.at(date).startOf('isoWeek').toDate();
  }

  startOfMonth(date: Date): Date {
    return this.at(date).startOf('month').toDate();
  }

  /** 'YYYY-MM-DD' của `date` theo APP_TIMEZONE */
  toIsoDate(date: Date): string {
    return this.format(date, ISO_DATE);
  }

  /** Parse 'YYYY-MM-DD' (đã validate) thành mốc 00:00 APP_TIMEZONE */
  fromIsoDate(iso: string): Date {
    return dayjs.tz(iso, this.timeZone).toDate();
  }

  /** 00:00 của ngày sau `iso` — mốc `< to` khi `to` là ngày bao gồm */
  afterIsoDate(iso: string): Date {
    return dayjs.tz(iso, this.timeZone).add(1, 'day').toDate();
  }

  /** [from, to) của hôm nay */
  dayRange(now = new Date()): DateRange {
    const from = this.at(now).startOf('day');
    return { from: from.toDate(), to: from.add(1, 'day').toDate() };
  }

  /**
   * Chuyển RangeQuery thành [from, to). `from`/`to` (ngày) ghi đè preset; `to` là ngày bao gồm.
   * Trả về null = không giới hạn (all).
   */
  resolveRange(query: Pick<RangeQuery, 'range' | 'from' | 'to'>, now = new Date()): DateRange | null {
    if (query.from || query.to) {
      return {
        from: query.from ? this.fromIsoDate(query.from) : EPOCH,
        to: query.to ? this.afterIsoDate(query.to) : FAR_FUTURE,
      };
    }
    const untilNow = dayjs(now).add(1, 'millisecond').toDate();
    switch (query.range) {
      case 'today':
        return this.dayRange(now);
      case 'week':
        return { from: this.startOfWeek(now), to: untilNow };
      case 'month':
        return { from: this.startOfMonth(now), to: untilNow };
      default:
        return null;
    }
  }
}
