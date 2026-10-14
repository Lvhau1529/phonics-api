import { type MediaView } from '@phonics/contracts';
import { type MediaRow } from '@/modules/media/types/media.types';

export function toMediaView(row: MediaRow): MediaView {
  return {
    id: row.id,
    url: row.url ?? '',
    kind: row.kind,
    status: row.status,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
  };
}
