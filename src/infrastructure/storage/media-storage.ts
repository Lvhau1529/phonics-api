import { type Readable } from 'node:stream';

/** Link PUT đã ký để client tải thẳng lên storage (không qua API) */
export interface PresignedPut {
  url: string;
  /** Client phải gửi đúng các header này */
  headers: Record<string, string>;
}

/** Tham số ký link PUT */
export interface PresignPutInput {
  key: string;
  mimeType: string;
  /** Kích thước client khai lúc presign (đã kiểm ≤ MEDIA_LIMITS) — body PUT phải đúng bằng số này */
  sizeBytes: number;
  expiresInSec: number;
}

/** Thông tin đối tượng đã lưu; `contentType` null khi storage không lưu (đĩa) */
export interface StoredObject {
  size: number;
  contentType: string | null;
}

/** Body vượt `maxBytes` khi đang ghi */
export class FileTooLargeError extends Error {}

/**
 * Nơi lưu file media, chọn theo `MEDIA_STORAGE`: `disk` (ổ đĩa VPS, ADR 0024) hoặc `r2` (Cloudflare R2).
 * Key do API sinh (`media/<owner>/<uuid>.<ext>`), không bao giờ lấy từ người dùng.
 */
export abstract class MediaStorage {
  /** URL gốc public để dựng link file (`${base}/${key}`) */
  abstract readonly publicBaseUrl: string;

  /** Link PUT tải thẳng lên storage; null = storage không hỗ trợ, client PUT qua API (`write`) */
  abstract presignPut(input: PresignPutInput): Promise<PresignedPut | null>;

  /** Ghi stream qua API, tối đa `maxBytes` (vượt → FileTooLargeError). Trả số byte đã ghi. */
  abstract write(key: string, body: Readable, maxBytes: number): Promise<number>;

  /** null nếu chưa có */
  abstract stat(key: string): Promise<StoredObject | null>;

  /** Xoá (không có thì bỏ qua) */
  abstract remove(key: string): Promise<void>;
}
