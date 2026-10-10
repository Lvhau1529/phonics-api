import { z } from 'zod';
import { IsoDateTime } from './common/dates.js';
import { Id } from './common/ids.js';

/**
 * Media (ảnh / audio) tải lên Neon Object Storage bằng presigned PUT (ADR 0018):
 *   POST /media/presign → client PUT file thẳng lên `uploadUrl` với đúng `headers` → POST /media/:id/complete.
 * API không bao giờ chạm byte; khi complete chỉ HEAD đối tượng để kiểm size / mime rồi đánh dấu READY.
 */
export const MediaKind = z.enum(['IMAGE', 'AUDIO']);
export type MediaKind = z.infer<typeof MediaKind>;

export const MediaStatus = z.enum(['PENDING', 'READY']);
export type MediaStatus = z.infer<typeof MediaStatus>;

/** Giới hạn theo loại (client kiểm trước, API kiểm lại ở presign và complete) */
export const MEDIA_LIMITS = {
  IMAGE: { maxBytes: 5 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  AUDIO: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: [
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/webm',
      'audio/ogg',
      'audio/wav',
      'audio/x-wav',
    ],
  },
} as const satisfies Record<MediaKind, { maxBytes: number; mimeTypes: readonly string[] }>;

/** Đuôi file theo mime (key trên bucket không lấy đuôi từ tên file người dùng gửi) */
export const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/** mime gửi lên có thể kèm codec (`audio/webm;codecs=opus`) → chỉ lấy phần trước `;` */
export const baseMimeType = (mimeType: string): string => mimeType.split(';')[0].trim().toLowerCase();

export const isMimeAllowed = (kind: MediaKind, mimeType: string): boolean =>
  (MEDIA_LIMITS[kind].mimeTypes as readonly string[]).includes(baseMimeType(mimeType));

export const PresignMediaBody = z
  .strictObject({
    kind: MediaKind,
    mimeType: z.string().trim().min(1).max(100),
    sizeBytes: z.int().min(1),
    fileName: z.string().trim().min(1).max(200),
  })
  .superRefine((b, ctx) => {
    if (!isMimeAllowed(b.kind, b.mimeType)) {
      ctx.addIssue({ code: 'custom', path: ['mimeType'], message: 'Định dạng file không hỗ trợ' });
    }
    if (b.sizeBytes > MEDIA_LIMITS[b.kind].maxBytes) {
      ctx.addIssue({ code: 'custom', path: ['sizeBytes'], message: 'File quá lớn' });
    }
  });
export type PresignMediaBody = z.infer<typeof PresignMediaBody>;

export const PresignMediaResponse = z.object({
  mediaId: Id,
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  /** Client phải gửi đúng các header này (đã ký trong URL) */
  headers: z.record(z.string(), z.string()),
  expiresAt: IsoDateTime,
});
export type PresignMediaResponse = z.infer<typeof PresignMediaResponse>;

/** Gợi ý hiển thị do client đo được (không dùng cho bảo mật) */
export const CompleteMediaBody = z.strictObject({
  width: z.int().min(1).max(10_000).optional(),
  height: z.int().min(1).max(10_000).optional(),
  durationMs: z.int().min(1).max(600_000).optional(),
});
export type CompleteMediaBody = z.infer<typeof CompleteMediaBody>;

/** Tham chiếu gọn, dùng trong `media` map của mọi response có config / answer chứa media */
export const MediaRef = z.object({ id: Id, url: z.url(), kind: MediaKind });
export type MediaRef = z.infer<typeof MediaRef>;

export const MediaView = MediaRef.extend({
  status: MediaStatus,
  mimeType: z.string(),
  sizeBytes: z.int().min(0),
  width: z.int().nullable(),
  height: z.int().nullable(),
  durationMs: z.int().nullable(),
  ownerId: Id,
  createdAt: IsoDateTime,
});
export type MediaView = z.infer<typeof MediaView>;

/**
 * Side-car: JSON (config / answer) giữ nguyên các khoá `*MediaId` / `*MediaIds` / `mediaId`;
 * response kèm `media: { [mediaId]: MediaRef }` để client tra URL.
 */
export const MediaMap = z.record(Id, MediaRef);
export type MediaMap = z.infer<typeof MediaMap>;

/** Khoá JSON được coi là tham chiếu media (xem collectMediaIds ở API và client) */
export const MEDIA_KEY_RE = /(^mediaId$|MediaIds?$)/;

/** Thu thập mọi id media trong một JSON bất kỳ (thuần, dùng cả ở API lẫn client) */
export function collectMediaIds(value: unknown, out: Set<string> = new Set()): string[] {
  const visit = (v: unknown, key: string | null): void => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') {
      if (key && MEDIA_KEY_RE.test(key) && Id.safeParse(v).success) out.add(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item, key);
      return;
    }
    if (typeof v === 'object') {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) visit(child, k);
    }
  };
  visit(value, null);
  return [...out];
}
