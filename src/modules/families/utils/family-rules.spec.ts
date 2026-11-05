import { describe, expect, it } from 'vitest';
import { type PendingChildRow } from '@/modules/families/types/family.types';
import { belongsToFamily, groupPendingChildren } from '@/modules/families/utils/family-rules';

function child(id: string, parentUserId?: string): PendingChildRow {
  return {
    userId: id,
    guardians: parentUserId
      ? [
          {
            guardian: {
              id: `g-${parentUserId}`,
              fullName: 'Lan',
              email: 'lan@example.vn',
              phone: null,
              user: { id: parentUserId, status: 'PENDING', role: 'PARENT', createdAt: new Date(0) },
            },
          },
        ]
      : [],
  } as unknown as PendingChildRow;
}

describe('groupPendingChildren', () => {
  it('gom bé theo tài khoản phụ huynh; bé không có tài khoản gia đình (đơn kiểu cũ) bị bỏ qua', () => {
    const groups = groupPendingChildren([child('a', 'p1'), child('legacy'), child('b', 'p1')]);
    expect(groups.map((g) => [g.id, g.children.map((c) => c.userId)])).toEqual([['p1', ['a', 'b']]]);
    expect(groups[0].parent).toMatchObject({ userId: 'p1', guardianId: 'g-p1', status: 'PENDING' });
  });

  it('phụ huynh không có tài khoản (chỉ nhận mail) không tạo đơn', () => {
    const row = child('a');
    row.guardians.push({
      guardian: { id: 'g0', fullName: 'Bố', email: null, phone: null, user: null },
    } as unknown as PendingChildRow['guardians'][number]);
    expect(groupPendingChildren([row])).toEqual([]);
  });
});

describe('belongsToFamily', () => {
  it('khớp theo tài khoản phụ huynh; id của chính bé không còn là đơn', () => {
    expect(belongsToFamily(child('a', 'p1'), 'p1')).toBe(true);
    expect(belongsToFamily(child('a', 'p1'), 'p2')).toBe(false);
    expect(belongsToFamily(child('legacy'), 'legacy')).toBe(false);
  });
});
