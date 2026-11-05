import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AppError } from '@/common/errors/app-error';
import { type Env } from '@/config/env.schema';
import { type AccessService } from '@/core/access/access.service';
import { type PrismaService } from '@/database/prisma.service';
import { FileTooLargeError, type MediaStorage } from '@/infrastructure/storage/media-storage';
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
  const storage = mockDeep<MediaStorage>();
  Object.assign(storage, { publicBaseUrl: 'https://api.example/files' });
  storage.presignPut.mockResolvedValue(null);
  const access = mockDeep<AccessService>();
  const service = new MediaService(prisma, env, storage, access);
  return { prisma, storage, access, service };
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

  it('presign: học sinh chỉ tải file game sinh, trần nhỏ hơn GV (STUDENT_MEDIA_LIMITS)', async () => {
    const { prisma, service } = setup();
    prisma.mediaAsset.create.mockResolvedValue(pendingRow as never);
    const student: AuthUser = { ...other, role: 'STUDENT' };
    const presign = (kind: 'IMAGE' | 'AUDIO', mimeType: string, sizeBytes: number, user = student) =>
      service.presign(user, { kind, mimeType, sizeBytes, fileName: 'f' });

    await expect(presign('IMAGE', 'image/jpeg', 1000)).rejects.toMatchObject({
      code: 'MEDIA_TYPE_UNSUPPORTED',
    });
    await expect(presign('IMAGE', 'image/png', 2 * 1024 * 1024)).rejects.toMatchObject({
      code: 'MEDIA_TOO_LARGE',
    });
    await expect(presign('AUDIO', 'audio/wav', 1000)).rejects.toMatchObject({
      code: 'MEDIA_TYPE_UNSUPPORTED',
    });
    await expect(presign('AUDIO', 'audio/webm;codecs=opus', 3 * 1024 * 1024)).rejects.toMatchObject({
      code: 'MEDIA_TOO_LARGE',
    });
    expect(prisma.mediaAsset.create).not.toHaveBeenCalled();

    await expect(presign('IMAGE', 'image/png', 200_000)).resolves.toBeDefined();
    await expect(presign('AUDIO', 'audio/mp4', 500_000)).resolves.toBeDefined();
    // GV vẫn theo MEDIA_LIMITS
    await expect(presign('IMAGE', 'image/jpeg', 4 * 1024 * 1024, teacher)).resolves.toBeDefined();
  });

  it('presign (R2): trả nguyên presigned URL + header của storage', async () => {
    const { prisma, storage, service } = setup();
    prisma.mediaAsset.create.mockResolvedValue(pendingRow as never);
    const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' };
    storage.presignPut.mockResolvedValue({
      url: 'https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=s',
      headers,
    });
    const r = await service.presign(teacher, {
      kind: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: 1000,
      fileName: 'a.png',
    });
    expect(storage.presignPut).toHaveBeenCalledWith({
      key: expect.stringMatching(/^media\//),
      mimeType: 'image/png',
      sizeBytes: 1000,
      expiresInSec: 900,
    });
    expect(r).toMatchObject({
      uploadUrl: 'https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=s',
      headers,
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

  it('upload: hợp lệ → ghi đĩa, trần = sizeBytes đã khai; vượt → 413 MEDIA_TOO_LARGE', async () => {
    const { prisma, storage, service } = setup();
    const exp = inFuture();
    const link = { exp, sig: signUpload(SECRET, pendingRow.id, exp) };
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    const body = Readable.from([Buffer.from('png')]);
    await service.upload(pendingRow.id, link, { contentType: 'image/png; charset=binary' }, body);
    expect(storage.write).toHaveBeenCalledWith(pendingRow.key, body, pendingRow.sizeBytes);

    await expect(
      service.upload(pendingRow.id, link, { contentType: 'image/png', contentLength: 1001 }, body),
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
    storage.stat.mockResolvedValue(null);
    await expect(service.complete(teacher, pendingRow.id, {})).rejects.toMatchObject({
      code: 'MEDIA_UPLOAD_INCOMPLETE',
    });
  });

  it('complete: size vượt sizeBytes đã khai → xoá file và 409', async () => {
    const { prisma, storage, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    storage.stat.mockResolvedValue({ size: 1001, contentType: null });
    await expect(service.complete(teacher, pendingRow.id, {})).rejects.toBeInstanceOf(AppError);
    expect(storage.remove).toHaveBeenCalledWith(pendingRow.key);
  });

  it('complete: mime đối tượng khác lúc presign → xoá và 409', async () => {
    const { prisma, storage, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    storage.stat.mockResolvedValue({ size: 900, contentType: 'text/html' });
    await expect(service.complete(teacher, pendingRow.id, {})).rejects.toMatchObject({
      code: 'MEDIA_UPLOAD_INCOMPLETE',
    });
    expect(storage.remove).toHaveBeenCalledWith(pendingRow.key);
  });

  it('complete: hợp lệ → READY với url public; gọi lại idempotent', async () => {
    const { prisma, storage, service } = setup();
    prisma.mediaAsset.findUnique.mockResolvedValue(pendingRow as never);
    storage.stat.mockResolvedValue({ size: 900, contentType: null });
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
    storage.stat.mockClear();
    await service.complete(teacher, pendingRow.id, {});
    expect(storage.stat).not.toHaveBeenCalled();
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
  describe('get: phạm vi xem file', () => {
    const readyRow = (
      ownerRole: 'ADMIN' | 'TEACHER' | 'STUDENT',
      ownerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    ) => ({
      ...pendingRow,
      ownerId,
      status: 'READY' as const,
      url: 'https://api.example/files/x.png',
      readyAt: new Date('2026-10-01T00:00:00Z'),
      owner: { role: ownerRole },
    });
    const admin: AuthUser = { ...teacher, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', role: 'ADMIN' };
    const student: AuthUser = { ...teacher, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', role: 'STUDENT' };

    it('admin xem mọi file, chủ file xem file của mình', async () => {
      const { prisma, access, service } = setup();
      prisma.mediaAsset.findUnique.mockResolvedValue(readyRow('STUDENT') as never);
      await expect(service.get(admin, pendingRow.id)).resolves.toMatchObject({ id: pendingRow.id });
      prisma.mediaAsset.findUnique.mockResolvedValue(readyRow('STUDENT', student.id) as never);
      await expect(service.get(student, pendingRow.id)).resolves.toMatchObject({ id: pendingRow.id });
      expect(access.assertStudentAccess).not.toHaveBeenCalled();
    });

    it('GV xem file của GV khác (nội dung câu hỏi dùng chung)', async () => {
      const { prisma, access, service } = setup();
      prisma.mediaAsset.findUnique.mockResolvedValue(readyRow('TEACHER', other.id) as never);
      await expect(service.get(teacher, pendingRow.id)).resolves.toMatchObject({ id: pendingRow.id });
      expect(access.assertStudentAccess).not.toHaveBeenCalled();
    });

    it('GV xem file học sinh: phải thuộc lớp mình (sai lớp → 403)', async () => {
      const { prisma, access, service } = setup();
      prisma.mediaAsset.findUnique.mockResolvedValue(readyRow('STUDENT', student.id) as never);
      await expect(service.get(teacher, pendingRow.id)).resolves.toMatchObject({ id: pendingRow.id });
      expect(access.assertStudentAccess).toHaveBeenCalledWith(teacher, student.id);
      access.assertStudentAccess.mockRejectedValue(new AppError('FORBIDDEN_SCOPE', 403));
      await expect(service.get(teacher, pendingRow.id)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    });

    it('học sinh không xem được file của người khác', async () => {
      const { prisma, service } = setup();
      prisma.mediaAsset.findUnique.mockResolvedValue(readyRow('TEACHER', teacher.id) as never);
      await expect(service.get(student, pendingRow.id)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    });
  });
});
