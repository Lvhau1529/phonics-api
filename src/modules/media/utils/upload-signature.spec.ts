import { describe, expect, it } from 'vitest';
import { signUpload, verifyUpload } from '@/modules/media/utils/upload-signature';

const SECRET = 'secret-secret-secret-secret-secret-00';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('upload-signature', () => {
  it('chữ ký đúng, còn hạn → hợp lệ', () => {
    const sig = signUpload(SECRET, ID, 1000);
    expect(verifyUpload(SECRET, ID, 1000, sig, 999)).toBe(true);
  });

  it('hết hạn, sai id, sai secret, sửa exp, chữ ký rác → không hợp lệ', () => {
    const sig = signUpload(SECRET, ID, 1000);
    expect(verifyUpload(SECRET, ID, 1000, sig, 1001)).toBe(false);
    expect(verifyUpload(SECRET, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1000, sig, 999)).toBe(false);
    expect(verifyUpload('other-secret-other-secret-other-00', ID, 1000, sig, 999)).toBe(false);
    expect(verifyUpload(SECRET, ID, 5000, sig, 999)).toBe(false);
    expect(verifyUpload(SECRET, ID, 1000, 'x', 999)).toBe(false);
    expect(verifyUpload(SECRET, ID, Number.NaN, sig, 999)).toBe(false);
  });
});
