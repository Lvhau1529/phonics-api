import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/common/utils/phone';

describe('normalizePhone', () => {
  it('đổi số Việt Nam sang E.164', () => {
    expect(normalizePhone('0912 345 678')).toBe('+84912345678');
    expect(normalizePhone('(091) 234-5678')).toBe('+84912345678');
    expect(normalizePhone('84912345678')).toBe('+84912345678');
    expect(normalizePhone('+84 912.345.678')).toBe('+84912345678');
  });

  it('giữ số nước ngoài, bỏ dấu + lạc', () => {
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('+84+912345678')).toBe('+84912345678');
  });

  it('rỗng → null', () => {
    expect(normalizePhone(' - ')).toBeNull();
  });
});
