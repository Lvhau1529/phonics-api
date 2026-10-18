import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { WORKSHEETS } from '@/config/constants';
import { type Env } from '@/config/env.schema';
import { FileTooLargeError, MediaStorage, type StoredObject } from '@/infrastructure/storage/media-storage';

export { FileTooLargeError };

/**
 * Lưu file media trên ổ đĩa của VPS (ADR 0024), thư mục `MEDIA_DIR` (Docker: volume `/data/media`). API tự phục
 * vụ ở `${API_PUBLIC_URL}/files/*` (configure-app). Vẫn chặn key thoát ra ngoài thư mục.
 */
export class DiskStorage extends MediaStorage {
  readonly root: string;
  readonly publicBaseUrl: string;

  constructor(env: Pick<Env, 'MEDIA_DIR' | 'MEDIA_PUBLIC_BASE_URL' | 'API_PUBLIC_URL'>) {
    super();
    this.root = resolve(env.MEDIA_DIR);
    this.publicBaseUrl = env.MEDIA_PUBLIC_BASE_URL ?? `${env.API_PUBLIC_URL}${WORKSHEETS.mediaFilesPath}`;
  }

  pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Key nằm ngoài MEDIA_DIR: ${key}`);
    return path;
  }

  /** Không có link tải thẳng — client PUT lên API (link có chữ ký HMAC, MediaService) */
  presignPut(): Promise<null> {
    return Promise.resolve(null);
  }

  /**
   * Ghi ra file tạm trong `.tmp/` rồi rename nên không bao giờ phục vụ file dở dang; ghi lại cùng key thì thay
   * file cũ.
   */
  async write(key: string, body: Readable, maxBytes: number): Promise<number> {
    const path = this.pathOf(key);
    const tmpDir = join(this.root, '.tmp');
    const tmp = join(tmpDir, randomUUID());
    await Promise.all([mkdir(dirname(path), { recursive: true }), mkdir(tmpDir, { recursive: true })]);
    let size = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        done(size > maxBytes ? new FileTooLargeError() : null, chunk);
      },
    });
    try {
      await pipeline(body, limit, createWriteStream(tmp, { flags: 'wx' }));
      await rename(tmp, path);
      return size;
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      return { size: (await stat(this.pathOf(key))).size, contentType: null };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
