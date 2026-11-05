import { StreamableFile } from '@nestjs/common';

/** File tải về đã sinh xong (xlsx / pdf…) */
export interface DownloadFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

/** `attachment; filename="ascii.xlsx"; filename*=UTF-8''...` (RFC 6266 / 5987) */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Nest tự đặt Content-Type / Content-Disposition / Content-Length từ options của StreamableFile */
export function toStreamable(file: DownloadFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: file.mime,
    disposition: contentDisposition(file.filename),
    length: file.buffer.length,
  });
}
