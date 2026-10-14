import { POINT_RULES } from '@phonics/contracts';
import { describe, expect, it } from 'vitest';
import { computePoints } from '@/modules/game-results/utils/game-result-rules';

const CLASS_ID = '33333333-3333-4333-8333-333333333333';

describe('computePoints', () => {
  const open = { enabled: true, unlocked: true };

  it('min(maxPerRound, correct × perCorrect)', () => {
    expect(computePoints(3, open, CLASS_ID, 0)).toEqual({ points: 3, reason: null });
    expect(computePoints(50, open, CLASS_ID, 0)).toEqual({ points: POINT_RULES.maxPerRound, reason: null });
    expect(computePoints(0, open, CLASS_ID, 0)).toEqual({ points: 0, reason: null });
  });

  it('game tắt / khoá / chưa có lớp → 0 điểm kèm lý do', () => {
    expect(computePoints(5, { enabled: false, unlocked: true }, CLASS_ID, 0).reason).toBe('GAME_DISABLED');
    expect(computePoints(5, { enabled: true, unlocked: false }, CLASS_ID, 0).reason).toBe('GAME_LOCKED');
    expect(computePoints(5, open, null, 0)).toEqual({ points: 0, reason: 'NO_CLASS' });
  });

  it('trần ngày cắt phần vượt', () => {
    const cap = POINT_RULES.dailyCap ?? 0;
    expect(computePoints(8, open, CLASS_ID, cap - 3)).toEqual({ points: 3, reason: 'DAILY_CAP' });
    expect(computePoints(8, open, CLASS_ID, cap)).toEqual({ points: 0, reason: 'DAILY_CAP' });
    expect(computePoints(8, open, CLASS_ID, cap - 8)).toEqual({ points: 8, reason: null });
  });
});
