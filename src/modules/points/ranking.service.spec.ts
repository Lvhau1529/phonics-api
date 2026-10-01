import { describe, expect, it } from 'vitest';
import { diffRanks } from './ranking.service';

describe('diffRanks', () => {
  it('báo thay đổi cho ai đổi hạng, bỏ qua lần đầu (null) và ai giữ nguyên', () => {
    const prev = new Map<string, number | null>([
      ['a', 1],
      ['b', 2],
      ['c', null],
    ]);
    const next = new Map<string, number>([
      ['a', 2],
      ['b', 1],
      ['c', 3],
    ]);
    expect(diffRanks(prev, next)).toEqual([
      { studentId: 'a', from: 1, to: 2 },
      { studentId: 'b', from: 2, to: 1 },
    ]);
  });

  it('không có thay đổi → mảng rỗng', () => {
    const prev = new Map<string, number | null>([['a', 1]]);
    const next = new Map<string, number>([['a', 1]]);
    expect(diffRanks(prev, next)).toEqual([]);
  });
});
