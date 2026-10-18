import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Env } from '@/config/env.schema';
import { DiskStorage, FileTooLargeError } from '@/infrastructure/storage/disk-storage';

describe('DiskStorage', () => {
  let dir: string;
  let storage: DiskStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phonics-media-'));
    storage = new DiskStorage({ MEDIA_DIR: dir, API_PUBLIC_URL: 'http://localhost:3000' } as Env);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('ghi file theo key (tạo thư mục con), đọc stat, xoá', async () => {
    const key = 'media/u1/a.png';
    expect(await storage.stat(key)).toBeNull();
    const written = await storage.write(key, Readable.from([Buffer.from('ab'), Buffer.from('cd')]), 10);
    expect(written).toBe(4);
    expect(await readFile(join(dir, key), 'utf8')).toBe('abcd');
    expect(await storage.stat(key)).toEqual({ size: 4, contentType: null });
    await storage.remove(key);
    expect(await storage.stat(key)).toBeNull();
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('vượt maxBytes → FileTooLargeError, không để lại file (kể cả file tạm)', async () => {
    const key = 'media/u1/big.png';
    await expect(
      storage.write(key, Readable.from([Buffer.alloc(6), Buffer.alloc(6)]), 10),
    ).rejects.toBeInstanceOf(FileTooLargeError);
    expect(await storage.stat(key)).toBeNull();
    expect(await readdir(join(dir, '.tmp'))).toEqual([]);
  });

  it('ghi lại cùng key thay file cũ', async () => {
    const key = 'media/u1/a.webm';
    await storage.write(key, Readable.from([Buffer.from('old-content')]), 100);
    await storage.write(key, Readable.from([Buffer.from('new')]), 100);
    expect(await readFile(join(dir, key), 'utf8')).toBe('new');
  });

  it('chặn key thoát khỏi MEDIA_DIR', () => {
    expect(() => storage.pathOf('../outside.png')).toThrow();
    expect(() => storage.pathOf('media/../../x')).toThrow();
  });
});
