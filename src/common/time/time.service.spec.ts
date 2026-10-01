import { describe, expect, it } from 'vitest';
import { type Env } from '../../config/env.schema';
import { TimeService } from './time.service';

const svc = new TimeService({ APP_TIMEZONE: 'Asia/Ho_Chi_Minh' } as Env);

describe('TimeService (Asia/Ho_Chi_Minh, UTC+7)', () => {
  it('startOfDay: 2026-10-01T20:00Z (= 03:00 ngày 2/10 giờ VN) → 2026-10-01T17:00Z', () => {
    expect(svc.startOfDay(new Date('2026-10-01T20:00:00Z')).toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });

  it('toIsoDate theo giờ VN', () => {
    expect(svc.toIsoDate(new Date('2026-10-01T20:00:00Z'))).toBe('2026-10-02');
    expect(svc.toIsoDate(new Date('2026-10-01T10:00:00Z'))).toBe('2026-10-01');
  });

  it('fromIsoDate → 00:00 giờ VN', () => {
    expect(svc.fromIsoDate('2026-10-02').toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });

  it('startOfWeek là thứ Hai', () => {
    // 2026-10-01 là thứ Năm (giờ VN) → thứ Hai 2026-09-28 00:00 VN = 09-27T17:00Z
    expect(svc.startOfWeek(new Date('2026-10-01T10:00:00Z')).toISOString()).toBe('2026-09-27T17:00:00.000Z');
  });

  it('startOfMonth', () => {
    expect(svc.startOfMonth(new Date('2026-10-15T10:00:00Z')).toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it('resolveRange: all → null, today → [00:00, +24h), from/to bao gồm ngày to', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    expect(svc.resolveRange({ range: 'all' }, now)).toBeNull();
    const today = svc.resolveRange({ range: 'today' }, now)!;
    expect(today.from.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(today.to.toISOString()).toBe('2026-10-01T17:00:00.000Z');
    const custom = svc.resolveRange({ range: 'all', from: '2026-09-01', to: '2026-09-30' }, now)!;
    expect(custom.from.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(custom.to.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });
});
