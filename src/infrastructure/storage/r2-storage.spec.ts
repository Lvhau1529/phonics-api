import { DeleteObjectCommand, HeadObjectCommand, NotFound, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { type Env } from '@/config/env.schema';
import { R2Storage } from '@/infrastructure/storage/r2-storage';

const env = {
  R2_ACCOUNT_ID: 'acc123',
  R2_ACCESS_KEY_ID: 'AKID',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'phonics-media',
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.vn',
} as Env;

function setup() {
  const storage = new R2Storage(env);
  const send = vi.spyOn((storage as unknown as { s3: S3Client }).s3, 'send');
  return { storage, send };
}

describe('R2Storage', () => {
  it('presignPut: URL ký SigV4 tới bucket (gồm Content-Type + Content-Length), header phải gửi kèm', async () => {
    const { storage } = setup();
    const r = await storage.presignPut({
      key: 'media/u1/a.png',
      mimeType: 'image/png',
      sizeBytes: 1234,
      expiresInSec: 900,
    });
    const url = new URL(r.url);
    expect(url.host).toBe('acc123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/phonics-media/media/u1/a.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['content-type', 'content-length']),
    );
    expect([...url.searchParams.keys()].some((k) => k.startsWith('x-amz-checksum'))).toBe(false);
    expect(r.headers['Content-Type']).toBe('image/png');
    expect(r.headers).not.toHaveProperty('Content-Length');
    expect(storage.publicBaseUrl).toBe('https://media.example.vn');
  });

  it('stat: HEAD → size + content type; không có → null', async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({ ContentLength: 42, ContentType: 'image/png' } as never);
    expect(await storage.stat('k')).toEqual({ size: 42, contentType: 'image/png' });
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);

    send.mockRejectedValueOnce(new NotFound({ message: 'nf', $metadata: {} }) as never);
    expect(await storage.stat('k')).toBeNull();
  });

  it('remove: DeleteObject đúng bucket / key', async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({} as never);
    await storage.remove('media/u1/a.png');
    const cmd = send.mock.calls[0][0] as DeleteObjectCommand;
    expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    expect(cmd.input).toEqual({ Bucket: 'phonics-media', Key: 'media/u1/a.png' });
  });
});
