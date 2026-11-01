import { describe, expect, it } from 'vitest';
import { isPermanentSmtpError } from '@/infrastructure/mail/smtp-mail-sender';

describe('isPermanentSmtpError', () => {
  it('địa chỉ bị từ chối (EENVELOPE / 550–554) → vĩnh viễn', () => {
    expect(isPermanentSmtpError({ code: 'EENVELOPE' })).toBe(true);
    expect(isPermanentSmtpError({ code: 'EMESSAGE', responseCode: 550 })).toBe(true);
    expect(isPermanentSmtpError({ responseCode: 554 })).toBe(true);
  });

  it('kết nối / tạm thời / sai đăng nhập → thử lại', () => {
    expect(isPermanentSmtpError({ code: 'ECONNECTION' })).toBe(false);
    expect(isPermanentSmtpError({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isPermanentSmtpError({ responseCode: 421 })).toBe(false);
    expect(isPermanentSmtpError({ responseCode: 451 })).toBe(false);
    expect(isPermanentSmtpError({ code: 'EAUTH', responseCode: 535 })).toBe(false);
    expect(isPermanentSmtpError({ code: 'EAUTH', responseCode: 550 })).toBe(false);
    expect(isPermanentSmtpError(new Error('boom'))).toBe(false);
    expect(isPermanentSmtpError(undefined)).toBe(false);
  });
});
