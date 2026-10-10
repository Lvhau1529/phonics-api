import { type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '../../../common/errors/app-error';
import { type Env } from '../../../config/env.schema';
import { type PrismaService } from '../../../database/prisma.service';
import { type AuthUser } from '../../auth/types/auth.types';
import { buildObjectKey } from '../utils/media-key';
import { MediaService } from './media.service';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://storage.example/resources/media/x?sig=1'),
}));

const teacher: AuthUser = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role: 'TEACHER',
  status: 'ACTIVE',
  tokenVersion: 0,
};
const other: AuthUser = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  role: 'TEACHER',
  status: 'ACTIVE',
  tokenVersion: 0,
};

const env = {
  AWS_ENDPOINT_URL_S3: 'https://storage.example',
  MEDIA_BUCKET: 'resources',
  MEDIA_PRESIGN_TTL_SEC: 900,
} as Env;

const pendingRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ownerId: teacher.id,
  kind: 'IMAGE' as const,
  key: `media/${teacher.id}/x.png`,
  url: null as string | null,
  mimeType: 'image/png',
  sizeBytes: 1000,
  width: null,
  height: null,
  durationMs: null,
  status: 'PENDING' as const,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  readyAt: null as Date | null,
};

function setup(withS3 = true) {
  const prisma = mockDeep<PrismaService>();
  const s3 = mockDeep<S3Client>();
  const service = new MediaService(prisma, env, withS3 ? s3 : null);
  return { prisma, s3, service };
}

describe('MediaService', () => {
  it('buildObjectKey: đuôi theo mime, không theo tên file', () => {
    expect(buildObjectKey('u1', 'audio/webm;codecs=opus')).toMatch(/^media\/u1\/[0-9a-f-]{36}\.webm$/);
    expect(buildObjectKey('u1', 'image/jpeg')).toMatch(/\.jpg$/);
  });

  it('presign: không có S3 → 503 MEDIA_STORAGE_DISABLED', async () => {
    const { service } = setup(false);
    await expect(
      service.presign(teacher, { kind: 'IMAGE', mimeType: 'image/png', sizeBytes: 10, fileName: 'a.png' }),
    ).rejects.toMatchObject({ code: 'MEDIA_STORAGE_DISABLED' });
  });

  it('presign: tạo bản ghi PENDING và trả header phải echo', async () => {
    const { prisma, service } = setup();
    prisma.mediaAsset.create.mockResolvedValue(pendingRow as never);
    const r = await service.presign(teacher, {
      kind: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: 1000,
      fileName: 'a.png',
    });
    expect(r.mediaId).toBe(pendingRow.id);
    expect(r.method).toBe('PUT');
    expect(r.headers['Content-Type']).toBe('image/png');
    expect(prisma.mediaAsset.create.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING',
      mimeType: 'image/png',
    });
  });

  it('complete: HEAD thất bại → 409 MEDIA_UPLOAD_INCOMPLETE', async () => {
    const { prisma, s3, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    s3.send.mockRejectedValue(new Error('NotFound') as never);
    await expect(service.complete(teacher, pendingRow.id, {})).rejects.toMatchObject({
      code: 'MEDIA_UPLOAD_INCOMPLETE',
    });
  });

  it('complete: size vượt giới hạn → xoá đối tượng và 409', async () => {
    const { prisma, s3, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    s3.send.mockImplementation((async (cmd: { constructor: { name: string } }) =>
      cmd.constructor.name === 'HeadObjectCommand'
        ? { ContentLength: 6 * 1024 * 1024, ContentType: 'image/png' }
        : {}) as never);
    await expect(service.complete(teacher, pendingRow.id, {})).rejects.toBeInstanceOf(AppError);
    const names = s3.send.mock.calls.map((c) => (c[0] as { constructor: { name: string } }).constructor.name);
    expect(names).toContain('DeleteObjectCommand');
  });

  it('complete: hợp lệ → READY với url public; gọi lại idempotent', async () => {
    const { prisma, s3, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    s3.send.mockResolvedValue({ ContentLength: 900, ContentType: 'image/png' } as never);
    const readyRow = { ...pendingRow, status: 'READY' as const, sizeBytes: 900, url: 'u' };
    prisma.mediaAsset.update.mockResolvedValue(readyRow as never);
    const view = await service.complete(teacher, pendingRow.id, { width: 10, height: 10 });
    expect(view.status).toBe('READY');
    const data = prisma.mediaAsset.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'READY',
      sizeBytes: 900,
      url: `https://storage.example/resources/${pendingRow.key}`,
    });

    prisma.mediaAsset.findUnique.mockResolvedValue(readyRow as never);
    s3.send.mockClear();
    await service.complete(teacher, pendingRow.id, {});
    expect(s3.send).not.toHaveBeenCalled();
  });

  it('complete: người khác → 403', async () => {
    const { prisma, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    await expect(service.complete(other, pendingRow.id, {})).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('assertOwnedReady: báo id chưa READY / không thuộc user', async () => {
    const { prisma, service } = setup();
    prisma.mediaAsset.findMany.mockResolvedValue([
      { id: 'a', status: 'READY', ownerId: teacher.id, kind: 'IMAGE' },
      { id: 'b', status: 'PENDING', ownerId: teacher.id, kind: 'IMAGE' },
      { id: 'c', status: 'READY', ownerId: other.id, kind: 'IMAGE' },
    ] as never);
    await expect(service.assertOwnedReady(['a', 'b', 'c', 'd'], teacher)).rejects.toMatchObject({
      code: 'MEDIA_NOT_READY',
      details: { mediaIds: ['b', 'c', 'd'] },
    });
    await expect(service.assertOwnedReady(['a'], teacher)).resolves.toBeUndefined();
  });

  it('hydrate: chỉ trả file READY', async () => {
    const { prisma, service } = setup();
    prisma.mediaAsset.findMany.mockResolvedValue([
      { id: 'a', url: 'https://x/a.png', kind: 'IMAGE' },
    ] as never);
    const map = await service.hydrate(['a', 'a', 'b']);
    expect(map).toEqual({ a: { id: 'a', url: 'https://x/a.png', kind: 'IMAGE' } });
  });
});
