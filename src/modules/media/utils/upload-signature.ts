import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Chữ ký của link upload (thay cho presigned URL của S3): HMAC-SHA256(secret, `media-upload:<id>:<exp>`),
 * `exp` = epoch giây. Client PUT không gửi bearer — chữ ký trong query là quyền ghi đúng một media, có hạn.
 */
export function signUpload(secret: string, mediaId: string, exp: number): string {
  return createHmac('sha256', secret).update(`media-upload:${mediaId}:${exp}`).digest('base64url');
}

export function verifyUpload(
  secret: string,
  mediaId: string,
  exp: number,
  sig: string,
  nowSec: number,
): boolean {
  if (!Number.isInteger(exp) || exp < nowSec) return false;
  const expected = Buffer.from(signUpload(secret, mediaId, exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
