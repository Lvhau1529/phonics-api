import { MEDIA_EXT, baseMimeType } from '@phonics/contracts';
import { randomUUID } from 'node:crypto';

/** Key trên bucket: `media/{ownerId}/{uuid}.{ext}` — đuôi lấy từ mime, không từ tên file người dùng */
export function buildObjectKey(ownerId: string, mimeType: string): string {
  const ext = MEDIA_EXT[baseMimeType(mimeType)] ?? 'bin';
  return `media/${ownerId}/${randomUUID()}.${ext}`;
}
