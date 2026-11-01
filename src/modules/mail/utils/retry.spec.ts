import { describe, expect, it } from 'vitest';
import { MAIL } from '@/config/constants';
import { errorText, nextRetryAt } from '@/modules/mail/utils/retry';

const NOW = new Date('2026-11-01T14:00:00.000Z');
const after = (d: Date | null) => (d ? d.getTime() - NOW.getTime() : null);

describe('nextRetryAt', () => {
  it('lần lỗi thứ n chờ backoffMs[n-1], hết mảng dùng phần tử cuối', () => {
    expect(after(nextRetryAt(1, NOW))).toBe(MAIL.backoffMs[0]);
    expect(after(nextRetryAt(2, NOW))).toBe(MAIL.backoffMs[1]);
    expect(after(nextRetryAt(MAIL.maxAttempts - 1, NOW))).toBe(
      MAIL.backoffMs[Math.min(MAIL.maxAttempts - 2, MAIL.backoffMs.length - 1)],
    );
  });

  it('đủ maxAttempts → null (FAILED)', () => {
    expect(nextRetryAt(MAIL.maxAttempts, NOW)).toBeNull();
    expect(nextRetryAt(MAIL.maxAttempts + 3, NOW)).toBeNull();
  });
});

describe('errorText', () => {
  it('một dòng, có tên lỗi, cắt độ dài', () => {
    expect(errorText(new TypeError('a\n  b'))).toBe('TypeError: a b');
    expect(errorText('x'.repeat(5000))).toHaveLength(MAIL.maxErrorLength);
  });
});
