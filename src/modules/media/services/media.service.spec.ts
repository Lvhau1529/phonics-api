import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type Env } from '@/config/env.schema';
import { type PrismaService } from '@/database/prisma.service';
import { type DiskStorage, FileTooLargeError } from '@/infrastructure/storage/disk-storage';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { buildObjectKey } from '@/modules/media/utils/media-key';
import { MediaService } from '@/modules/media/services/media.service';
import { signUpload } from '@/modules/media/utils/upload-signature';

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

const SECRET = 'test-secret-test-secret-test-secret-00';
const env = {
  API_PUBLIC_URL: 'https://api.example',
  JWT_ACCESS_SECRET: SECRET,
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

function setup() {
  const prisma = mockDeep<PrismaService>();
  const storage = mockDeep<DiskStorage>();
  const service = new MediaService(prisma, env, storage);
  return { prisma, storage, service };
}

const inFuture = () => Math.floor(Date.now() / 1000) + 600;

describe('MediaService', () => {
  it('buildObjectKey: đuôi theo mime, không theo tên file', () => {
    expect(buildObjectKey('u1', 'audio/webm;codecs=opus')).toMatch(/^media\/u1\/[0-9a-f-]{36}\.webm$/);
    expect(buildObjectKey('u1', 'image/jpeg')).toMatch(/\.jpg$/);
  });

  it('presign: tạo bản ghi PENDING, link upload của API có chữ ký, header phải echo', async () => {
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
    expect(r.headers).toEqual({ 'Content-Type': 'image/png' });
    const url = new URL(r.uploadUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`https://api.example/api/v1/media/${pendingRow.id}/upload`);
    const exp = Number(url.searchParams.get('exp'));
    expect(url.searchParams.get('sig')).toBe(signUpload(SECRET, pendingRow.id, exp));
    expect(prisma.mediaAsset.create.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING',
      mimeType: 'image/png',
    });
  });

  it('upload: chữ ký sai / hết hạn → 403, không đọc DB', async () => {
    const { prisma, storage, service } = setup();
    const body = Readable.from([Buffer.from('x')]);
    const exp = inFuture();
    await expect(
      service.upload(pendingRow.id, { exp, sig: 'bad' }, { contentType: 'image/png' }, body),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const expired = Math.floor(Date.now() / 1000) - 1;
    const sig = signUpload(SECRET, pendingRow.id, expired);
    await expect(
      service.upload(pendingRow.id, { exp: expired, sig }, { contentType: 'image/png' }, body),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(prisma.mediaAsset.findUnique).not.toHaveBeenCalled();
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('upload: Content-Type khác lúc presign → 415; đã READY → 409', async () => {
    const { prisma, storage, service } = setup();
    const exp = inFuture();
    const link = { exp, sig: signUpload(SECRET, pendingRow.id, exp) };
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    await expect(
      service.upload(pendingRow.id, link, { contentType: 'image/jpeg' }, Readable.from([])),
    ).rejects.toMatchObject({
      code: 'MEDIA_TYPE_UNSUPPORTED',
    });
    prisma.mediaAsset.findUnique.mockResolvedValue({ ...pendingRow, status: 'READY' } as never);
    await expect(
      service.upload(pendingRow.id, link, { contentType: 'image/png' }, Readable.from([])),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('upload: hợp lệ → ghi đĩa với giới hạn theo loại; vượt → 413 MEDIA_TOO_LARGE', async () => {
    const { prisma, storage, service } = setup();
    const exp = inFuture();
    const link = { exp, sig: signUpload(SECRET, pendingRow.id, exp) };
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    const body = Readable.from([Buffer.from('png')]);
    await service.upload(pendingRow.id, link, { contentType: 'image/png; charset=binary' }, body);
    expect(storage.write).toHaveBeenCalledWith(pendingRow.key, body, 5 * 1024 * 1024);

    await expect(
      service.upload(pendingRow.id, link, { contentType: 'image/png', contentLength: 6 * 1024 * 1024 }, body),
    ).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
    expect(storage.write).toHaveBeenCalledTimes(1);

    storage.write.mockRejectedValue(new FileTooLargeError());
    await expect(
      service.upload(pendingRow.id, link, { contentType: 'image/png' }, body),
    ).rejects.toMatchObject({
      code: 'MEDIA_TOO_LARGE',
    });
  });

  it('complete: chưa có file → 409 MEDIA_UPLOAD_INCOMPLETE', async () => {
    const { prisma, storage, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    storage.size.mockResolvedValue(null);
    await expect(service.complete(teacher, pendingRow.id, {})).rejects.toMatchObject({
      code: 'MEDIA_UPLOAD_INCOMPLETE',
    });
  });

  it('complete: size vượt giới hạn → xoá file và 409', async () => {
    const { prisma, storage, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    storage.size.mockResolvedValue(6 * 1024 * 1024);
    await expect(service.complete(teacher, pendingRow.id, {})).rejects.toBeInstanceOf(AppError);
    expect(storage.remove).toHaveBeenCalledWith(pendingRow.key);
  });

  it('complete: hợp lệ → READY với url public; gọi lại idempotent', async () => {
    const { prisma, storage, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    storage.size.mockResolvedValue(900);
    const readyRow = { ...pendingRow, status: 'READY' as const, sizeBytes: 900, url: 'u' };
    prisma.mediaAsset.update.mockResolvedValue(readyRow as never);
    const view = await service.complete(teacher, pendingRow.id, { width: 10, height: 10 });
    expect(view.status).toBe('READY');
    const data = prisma.mediaAsset.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'READY',
      sizeBytes: 900,
      url: `https://api.example/files/${pendingRow.key}`,
    });

    prisma.mediaAsset.findUnique.mockResolvedValue(readyRow as never);
    storage.size.mockClear();
    await service.complete(teacher, pendingRow.id, {});
    expect(storage.size).not.toHaveBeenCalled();
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
