import { describe, expect, it } from 'vitest';
import { planPhoneChanges } from '@/database/maintenance/phone-changes';

describe('planPhoneChanges', () => {
  it('chỉ ghi lại số đổi khi chuẩn hoá, liệt kê riêng số không hợp lệ', () => {
    const { changes, invalid } = planPhoneChanges([
      { id: 'a', fullName: 'Đã chuẩn', phone: '+84912345678' },
      { id: 'b', fullName: 'Đầu số cũ', phone: '01661234567' },
      { id: 'c', fullName: 'Có số 0 sau +84', phone: '+84 0912 345 678' },
      { id: 'd', fullName: 'Sai', phone: '12345' },
    ]);
    expect(changes).toEqual([
      { id: 'b', fullName: 'Đầu số cũ', phone: '01661234567', next: '+84361234567' },
      { id: 'c', fullName: 'Có số 0 sau +84', phone: '+84 0912 345 678', next: '+84912345678' },
    ]);
    expect(invalid.map((row) => row.id)).toEqual(['d']);
  });
});
