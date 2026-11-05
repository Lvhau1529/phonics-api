import { describe, expect, it } from 'vitest';
import { crc16, vietQrPayload } from '@/modules/extra-lessons/utils/vietqr';

describe('vietqr', () => {
  it('crc16: vector chuẩn CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('QR động có số tiền + nội dung, CRC khớp phần trước nó', () => {
    const payload = vietQrPayload({
      bin: '970436',
      accountNo: '0123456789',
      amount: 1_200_000,
      content: 'HP T10 2026 AN',
    });
    expect(payload.startsWith('000201010212')).toBe(true);
    expect(payload).toContain('38540010A00000072701240006970436011001234567890208QRIBFTTA');
    expect(payload).toContain('5303704540712000005802VN');
    expect(payload).toContain('62180814HP T10 2026 AN');
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it('không có số tiền / nội dung → QR tĩnh, bỏ trường 54 và 62', () => {
    const payload = vietQrPayload({ bin: '970436', accountNo: '0123456789', amount: 0, content: null });
    expect(payload.startsWith('000201010211')).toBe(true);
    expect(payload).not.toContain('5406');
    expect(payload).not.toContain('6218');
  });
});
