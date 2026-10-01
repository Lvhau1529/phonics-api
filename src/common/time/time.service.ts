import { Inject, Injectable } from '@nestjs/common';
import { type RangeQuery } from '@phonics/contracts';
import { ENV } from '../../config/env.module';
import { type Env } from '../../config/env.schema';

export interface DateRange {
  from: Date;
  /** Không bao gồm (`< to`) */
  to: Date;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Mọi phép "hôm nay / tuần này / tháng này" tính theo APP_TIMEZONE (không phải UTC của server).
 * Thuật toán: lấy thành phần ngày giờ trong múi giờ bằng Intl, rồi quy về mốc UTC tương ứng.
 */
@Injectable()
export class TimeService {
  readonly timeZone: string;
  private readonly dtf: Intl.DateTimeFormat;

  constructor(@Inject(ENV) env: Env) {
    this.timeZone = env.APP_TIMEZONE;
    this.dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
  }

  /** Thành phần ngày giờ của `date` trong APP_TIMEZONE */
  parts(date: Date): { y: number; m: number; d: number; h: number; mi: number; s: number; weekday: number } {
    const p: Record<string, string> = {};
    for (const part of this.dtf.formatToParts(date)) p[part.type] = part.value;
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, weekday };
  }

  /** Chênh lệch múi giờ (ms) tại thời điểm `date` */
  private offsetMs(date: Date): number {
    const p = this.parts(date);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  /** Mốc UTC của `y-m-d 00:00` theo APP_TIMEZONE */
  zonedMidnight(y: number, m: number, d: number): Date {
    const guess = new Date(Date.UTC(y, m - 1, d));
    // Lấy offset tại thời điểm gần đúng rồi hiệu chỉnh (đủ cho múi giờ không DST; có DST cũng hội tụ sau 2 bước)
    let result = new Date(guess.getTime() - this.offsetMs(guess));
    result = new Date(guess.getTime() - this.offsetMs(result));
    return result;
  }

  startOfDay(date: Date): Date {
    const p = this.parts(date);
    return this.zonedMidnight(p.y, p.m, p.d);
  }

  /** Thứ Hai đầu tuần */
  startOfWeek(date: Date): Date {
    const p = this.parts(date);
    const back = (p.weekday + 6) % 7;
    return new Date(this.zonedMidnight(p.y, p.m, p.d).getTime() - back * DAY_MS);
  }

  startOfMonth(date: Date): Date {
    const p = this.parts(date);
    return this.zonedMidnight(p.y, p.m, 1);
  }

  /** 'YYYY-MM-DD' của `date` theo APP_TIMEZONE */
  toIsoDate(date: Date): string {
    const p = this.parts(date);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }

  /** Parse 'YYYY-MM-DD' (đã validate) thành mốc 00:00 APP_TIMEZONE */
  fromIsoDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return this.zonedMidnight(y, m, d);
  }

  /** [from, to) của hôm nay */
  dayRange(now = new Date()): DateRange {
    const from = this.startOfDay(now);
    return { from, to: new Date(from.getTime() + DAY_MS) };
  }

  /**
   * Chuyển RangeQuery thành [from, to). `from`/`to` (ngày) ghi đè preset; `to` là ngày bao gồm.
   * Trả về null = không giới hạn (all).
   */
  resolveRange(query: Pick<RangeQuery, 'range' | 'from' | 'to'>, now = new Date()): DateRange | null {
    if (query.from || query.to) {
      const from = query.from ? this.fromIsoDate(query.from) : new Date(0);
      const to = query.to ? new Date(this.fromIsoDate(query.to).getTime() + DAY_MS) : new Date('2100-01-01');
      return { from, to };
    }
    switch (query.range) {
      case 'today':
        return this.dayRange(now);
      case 'week':
        return { from: this.startOfWeek(now), to: new Date(now.getTime() + 1) };
      case 'month':
        return { from: this.startOfMonth(now), to: new Date(now.getTime() + 1) };
      default:
        return null;
    }
  }
}
