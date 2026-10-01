import { describe, expect, it } from 'vitest';
import { distribute, distributionWidth } from './stats.service';

describe('distributionWidth', () => {
  it('chọn bước theo điểm cao nhất', () => {
    expect(distributionWidth(0)).toBe(10);
    expect(distributionWidth(50)).toBe(10);
    expect(distributionWidth(51)).toBe(25);
    expect(distributionWidth(200)).toBe(25);
    expect(distributionWidth(201)).toBe(50);
  });
});

describe('distribute', () => {
  it('lớp rỗng → một bucket rỗng', () => {
    expect(distribute([])).toEqual([{ from: 0, to: 10, count: 0 }]);
  });

  it('điểm 0 và điểm âm rơi vào bucket đầu, bucket cuối chứa điểm cao nhất', () => {
    expect(distribute([0, -3, 5, 10, 19, 45])).toEqual([
      { from: 0, to: 10, count: 3 },
      { from: 10, to: 20, count: 2 },
      { from: 20, to: 30, count: 0 },
      { from: 30, to: 40, count: 0 },
      { from: 40, to: 50, count: 1 },
    ]);
  });

  it('điểm lớn dùng bước 25 / 50', () => {
    const buckets = distribute([120, 60]);
    expect(buckets.map((b) => b.from)).toEqual([0, 25, 50, 75, 100]);
    expect(buckets[2].count).toBe(1);
    expect(buckets[4].count).toBe(1);
    expect(distribute([250]).at(-1)).toEqual({ from: 250, to: 300, count: 1 });
  });
});
