import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';

/** Body vượt `maxBytes` khi đang ghi */
export class FileTooLargeError extends Error {}

/**
 * Lưu file media trên ổ đĩa của VPS (ADR 0024), thư mục `MEDIA_DIR` (Docker: volume `/data/media`).
 * Key do API sinh (`media/<owner>/<uuid>.<ext>`), không bao giờ lấy từ người dùng; vẫn chặn key thoát ra ngoài thư mục.
 */
@Injectable()
export class DiskStorage {
  readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.MEDIA_DIR);
  }

  pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Key nằm ngoài MEDIA_DIR: ${key}`);
    return path;
  }

  /**
   * Ghi stream vào `key`, tối đa `maxBytes` (vượt → FileTooLargeError). Ghi ra file tạm trong `.tmp/` rồi rename
   * nên không bao giờ phục vụ file dở dang; ghi lại cùng key thì thay file cũ. Trả số byte đã ghi.
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

  /** Kích thước file (byte); null nếu chưa có */
  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathOf(key))).size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  /** Xoá file (không có thì bỏ qua) */
  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
