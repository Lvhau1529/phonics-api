import { describe, expect, it } from 'vitest';
import { planRateInsert, type RateRow, resolveRate } from '@/modules/extra-lessons/utils/rate';
import { isActiveOn, rangesOverlap } from '@/modules/extra-lessons/utils/schedule';

const row = (over: Partial<RateRow> & Pick<RateRow, 'id'>): RateRow => ({
  studentId: null,
  slotId: null,
  pricePerSession: 100_000,
  effectiveFrom: '2026-09-01',
  effectiveTo: null,
  ...over,
});

describe('resolveRate', () => {
  const rates = [
    row({ id: 'slot', slotId: 'c1', pricePerSession: 120_000 }),
    row({ id: 'kid', studentId: 's1', pricePerSession: 100_000, effectiveFrom: '2026-10-01' }),
    row({ id: 'kid-c2', studentId: 's1', slotId: 'c2', pricePerSession: 90_000 }),
  ];

  it('ưu tiên (HS, ca) → (HS) → (ca)', () => {
    expect(resolveRate(rates, 's1', 'c2', '2026-10-05')).toEqual({
      pricePerSession: 90_000,
      source: 'STUDENT_SLOT',
      rateId: 'kid-c2',
    });
    expect(resolveRate(rates, 's1', 'c1', '2026-10-05')).toMatchObject({ source: 'STUDENT', rateId: 'kid' });
    // Giá riêng HS chưa hiệu lực trước 01/10 → giá mặc định ca
    expect(resolveRate(rates, 's1', 'c1', '2026-09-30')).toMatchObject({
      source: 'SLOT',
      pricePerSession: 120_000,
    });
    expect(resolveRate(rates, 's2', 'c1', '2026-10-05')).toMatchObject({ source: 'SLOT', rateId: 'slot' });
  });

  it('chưa có giá → 0đ, NONE; buổi bù (không ca) chỉ dùng giá riêng HS', () => {
    expect(resolveRate(rates, 's2', 'c9', '2026-10-05')).toEqual({
      pricePerSession: 0,
      source: 'NONE',
      rateId: null,
    });
    expect(resolveRate(rates, 's1', null, '2026-10-05')).toMatchObject({ source: 'STUDENT' });
    expect(resolveRate(rates, 's2', null, '2026-10-05')).toMatchObject({ source: 'NONE' });
  });

  it('dòng đã đóng / bị thay thế không còn hiệu lực', () => {
    const history = [
      row({ id: 'old', slotId: 'c1', pricePerSession: 100_000, effectiveTo: '2026-10-01' }),
      row({ id: 'void', slotId: 'c1', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-01' }),
      row({ id: 'new', slotId: 'c1', pricePerSession: 130_000, effectiveFrom: '2026-10-01' }),
    ];
    expect(resolveRate(history, 's1', 'c1', '2026-09-30').rateId).toBe('old');
    expect(resolveRate(history, 's1', 'c1', '2026-10-01').rateId).toBe('new');
  });
});

describe('planRateInsert', () => {
  it('đóng dòng đang phủ ngày mới, thay thế dòng bắt đầu từ ngày đó trở đi', () => {
    const rows = [
      { id: 'a', effectiveFrom: '2026-08-01', effectiveTo: '2026-09-01' },
      { id: 'b', effectiveFrom: '2026-09-01', effectiveTo: '2026-10-15' },
      { id: 'c', effectiveFrom: '2026-10-15', effectiveTo: null },
    ];
    expect(planRateInsert(rows, '2026-10-01')).toEqual([
      { id: 'b', effectiveTo: '2026-10-01' },
      { id: 'c', effectiveTo: '2026-10-15' },
    ]);
  });

  it('cùng ngày bắt đầu → dòng cũ bị thay thế; dòng đã thay thế giữ nguyên', () => {
    expect(
      planRateInsert(
        [
          { id: 'a', effectiveFrom: '2026-10-01', effectiveTo: null },
          { id: 'void', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-01' },
        ],
        '2026-10-01',
      ),
    ).toEqual([{ id: 'a', effectiveTo: '2026-10-01' }]);
  });
});

describe('schedule', () => {
  it('khoảng nửa mở', () => {
    expect(isActiveOn({ from: '2026-10-01', to: '2026-10-08' }, '2026-10-07')).toBe(true);
    expect(isActiveOn({ from: '2026-10-01', to: '2026-10-08' }, '2026-10-08')).toBe(false);
    expect(isActiveOn({ from: '2026-10-01', to: null }, '2030-01-01')).toBe(true);
  });

  it('chồng nhau', () => {
    expect(rangesOverlap({ from: '2026-10-01', to: '2026-10-08' }, { from: '2026-10-08', to: null })).toBe(
      false,
    );
    expect(rangesOverlap({ from: '2026-10-01', to: null }, { from: '2026-09-01', to: '2026-10-02' })).toBe(
      true,
    );
    expect(rangesOverlap({ from: '2026-10-01', to: null }, { from: '2027-01-01', to: null })).toBe(true);
  });
});
