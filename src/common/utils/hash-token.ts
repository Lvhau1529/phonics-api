import { createHash } from 'node:crypto';

/** sha256 hex của token một lần trong link mail (DB chỉ lưu hash) */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
