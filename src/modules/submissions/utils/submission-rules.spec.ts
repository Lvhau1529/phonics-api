import { describe, expect, it } from 'vitest';
import { totalOf } from '@/modules/submissions/utils/submission-rules';

describe('submission-rules', () => {
  it('totalOf: điểm GV ưu tiên hơn điểm tự chấm', () => {
    expect(
      totalOf([
        { manualScore: null, autoScore: 1 },
        { manualScore: 1.5, autoScore: null },
        { manualScore: 0, autoScore: 1 },
      ]),
    ).toBe(2.5);
  });
});
