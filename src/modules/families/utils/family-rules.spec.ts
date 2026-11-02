import { describe, expect, it } from 'vitest';
import { type PendingChildRow } from '@/modules/families/types/family.types';
import { belongsToFamily, convertPlan, groupPendingChildren } from '@/modules/families/utils/family-rules';

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
  it('gom bé theo tài khoản phụ huynh; bé đăng ký kiểu cũ là một đơn riêng', () => {
    const groups = groupPendingChildren([child('a', 'p1'), child('legacy'), child('b', 'p1')]);
    expect(groups.map((g) => [g.id, g.children.map((c) => c.userId)])).toEqual([
      ['p1', ['a', 'b']],
      ['legacy', ['legacy']],
    ]);
    expect(groups[0].parent).toMatchObject({ userId: 'p1', guardianId: 'g-p1', status: 'PENDING' });
    expect(groups[1].parent).toBeNull();
  });

  it('phụ huynh không có tài khoản (chỉ nhận mail) không tạo đơn riêng', () => {
    const row = child('a');
    row.guardians.push({
      guardian: { id: 'g0', fullName: 'Bố', email: null, phone: null, user: null },
    } as unknown as PendingChildRow['guardians'][number]);
    expect(groupPendingChildren([row])[0]).toMatchObject({ id: 'a', parent: null });
  });
});

describe('belongsToFamily', () => {
  it('khớp theo tài khoản phụ huynh hoặc chính bé', () => {
    expect(belongsToFamily(child('a', 'p1'), 'p1')).toBe(true);
    expect(belongsToFamily(child('a', 'p1'), 'p2')).toBe(false);
    expect(belongsToFamily(child('legacy'), 'legacy')).toBe(true);
  });
});

describe('convertPlan', () => {
  const base = { requestedIds: ['s1', 's2'], emailOwner: null };

  it('phụ huynh đã có tài khoản → existing', () => {
    const plan = convertPlan({
      ...base,
      guardian: { email: 'lan@example.vn', userId: 'p1' },
      students: [
        { id: 's1', email: 'lan@example.vn' },
        { id: 's2', email: null },
      ],
    });
    expect(plan).toEqual({ account: 'existing', credentialsFrom: null, blockers: [] });
  });

  it('học sinh đăng nhập bằng email phụ huynh → chuyển thông tin đăng nhập', () => {
    const plan = convertPlan({
      ...base,
      guardian: { email: 'lan@example.vn', userId: null },
      students: [
        { id: 's1', email: 'an@example.vn' },
        { id: 's2', email: 'lan@example.vn' },
      ],
      emailOwner: { id: 's2' },
    });
    expect(plan).toEqual({ account: 'move', credentialsFrom: 's2', blockers: [] });
  });

  it('tạo mới: chặn khi thiếu email hoặc email là tài khoản khác', () => {
    const students = [
      { id: 's1', email: null },
      { id: 's2', email: null },
    ];
    expect(convertPlan({ ...base, guardian: { email: null, userId: null }, students }).blockers).toEqual([
      'GUARDIAN_NO_EMAIL',
    ]);
    expect(
      convertPlan({
        ...base,
        guardian: { email: 'lan@example.vn', userId: null },
        students,
        emailOwner: { id: 'teacher' },
      }),
    ).toEqual({ account: 'create', credentialsFrom: null, blockers: ['EMAIL_USED_BY_OTHER_ACCOUNT'] });
  });

  it('thiếu học sinh → STUDENT_NOT_FOUND', () => {
    const plan = convertPlan({
      ...base,
      guardian: { email: 'lan@example.vn', userId: null },
      students: [{ id: 's1', email: null }],
    });
    expect(plan.blockers).toEqual(['STUDENT_NOT_FOUND']);
  });
});
