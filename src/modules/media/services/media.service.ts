import { type Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  API_PREFIX,
  baseMimeType,
  MEDIA_LIMITS,
  type CompleteMediaBody,
  type MediaKind,
  type MediaMap,
  type MediaRef,
  type MediaView,
  type PresignMediaBody,
  type PresignMediaResponse,
} from '@phonics/contracts';
import { AppError, notFound } from '@/common/errors/app-error';
import { WORKSHEETS } from '@/config/constants';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { PrismaService } from '@/database/prisma.service';
import { type Tx } from '@/database/types';
import { DiskStorage, FileTooLargeError } from '@/infrastructure/storage/disk-storage';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { toMediaView } from '@/modules/media/dto/responses/media.view';
import { buildObjectKey } from '@/modules/media/utils/media-key';
import { signUpload, verifyUpload } from '@/modules/media/utils/upload-signature';
import { dayjs } from '@/core/time/dayjs';

/**
 * Media (ảnh / audio) lưu trên ổ đĩa VPS — ADR 0024 (thay Neon Object Storage của ADR 0018, giữ nguyên contracts):
 * presign (bản ghi PENDING + link PUT có chữ ký) → client PUT byte lên API (`upload`) → complete (kiểm size) →
 * READY. File public phục vụ ở `${API_PUBLIC_URL}/files/...` (configure-app). Mọi response có media đi kèm
 * `media: MediaMap` qua `hydrate()`.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly storage: DiskStorage,
  ) {}

  /** URL public của một key (API tự phục vụ, hoặc CDN qua MEDIA_PUBLIC_BASE_URL) */
  publicUrl(key: string): string {
    const base = this.env.MEDIA_PUBLIC_BASE_URL ?? `${this.env.API_PUBLIC_URL}${WORKSHEETS.mediaFilesPath}`;
    return `${base.replace(/\/+$/, '')}/${key}`;
  }

  /** Tạo bản ghi PENDING + link PUT đã ký. Client phải gửi đúng `headers` trả về. */
  async presign(user: AuthUser, body: PresignMediaBody): Promise<PresignMediaResponse> {
    const mimeType = baseMimeType(body.mimeType);
    const key = buildObjectKey(user.id, mimeType);
    const row = await this.prisma.mediaAsset.create({
      data: {
        ownerId: user.id,
        kind: body.kind,
        key,
        mimeType,
        sizeBytes: body.sizeBytes,
        status: 'PENDING',
      },
    });
    const expiresAt = dayjs().add(this.env.MEDIA_PRESIGN_TTL_SEC, 'second');
    const exp = expiresAt.unix();
    const sig = signUpload(this.env.JWT_ACCESS_SECRET, row.id, exp);
    const uploadUrl = `${this.env.API_PUBLIC_URL}${API_PREFIX}/media/${row.id}/upload?exp=${exp}&sig=${sig}`;
    return {
      mediaId: row.id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * PUT byte lên link đã ký (không cần đăng nhập — chữ ký là quyền ghi đúng media này, có hạn). Kiểm Content-Type
   * khớp lúc presign và giới hạn dung lượng theo MEDIA_LIMITS: theo Content-Length trước khi đọc (trả 413 gọn), rồi
   * đếm byte trong lúc ghi (client khai sai → cắt kết nối). Media phải còn PENDING.
   */
  async upload(
    id: string,
    link: { exp: number; sig: string },
    request: { contentType: string; contentLength?: number },
    body: Readable,
  ): Promise<void> {
    if (!verifyUpload(this.env.JWT_ACCESS_SECRET, id, link.exp, link.sig, dayjs().unix())) {
      throw new AppError('FORBIDDEN', 403, { message: 'uploadLinkInvalid' });
    }
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row) throw notFound('fileNotFound');
    if (row.status !== 'PENDING') throw new AppError('CONFLICT', 409, { message: 'fileAlreadyUploaded' });
    if (baseMimeType(request.contentType) !== row.mimeType) {
      throw new AppError('MEDIA_TYPE_UNSUPPORTED', 415, { message: 'contentTypeMismatch' });
    }
    const maxBytes = MEDIA_LIMITS[row.kind].maxBytes;
    if (request.contentLength !== undefined && request.contentLength > maxBytes) {
      throw new AppError('MEDIA_TOO_LARGE', 413);
    }
    try {
      await this.storage.write(row.key, body, maxBytes);
    } catch (e) {
      if (e instanceof FileTooLargeError) throw new AppError('MEDIA_TOO_LARGE', 413);
      throw e;
    }
  }

  /**
   * Xác nhận đã PUT xong: kiểm file có trên đĩa và size theo MEDIA_LIMITS; sai → xoá file, 409.
   * Idempotent: đã READY thì trả luôn.
   */
  async complete(user: AuthUser, id: string, body: CompleteMediaBody): Promise<MediaView> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row) throw notFound('fileNotFound');
    if (row.ownerId !== user.id && user.role !== 'ADMIN') throw new AppError('FORBIDDEN_SCOPE', 403);
    if (row.status === 'READY') return toMediaView(row);

    const size = await this.storage.size(row.key);
    if (size === null) throw new AppError('MEDIA_UPLOAD_INCOMPLETE', 409);
    const limit = MEDIA_LIMITS[row.kind].maxBytes;
    if (size <= 0 || size > limit) {
      await this.deleteObject(row.key);
      throw new AppError('MEDIA_UPLOAD_INCOMPLETE', 409, {
        fieldErrors: { sizeBytes: [size > limit ? 'MEDIA_TOO_LARGE' : 'fileEmpty'] },
      });
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        sizeBytes: size,
        url: this.publicUrl(row.key),
        status: 'READY',
        readyAt: new Date(),
        width: body.width,
        height: body.height,
        durationMs: body.durationMs,
      },
    });
    return toMediaView(updated);
  }

  /** GV / admin xem bất kỳ; học sinh chỉ file của mình */
  async get(user: AuthUser, id: string): Promise<MediaView> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row) throw notFound('fileNotFound');
    if (user.role === 'STUDENT' && row.ownerId !== user.id) throw new AppError('FORBIDDEN_SCOPE', 403);
    return toMediaView(row);
  }

  /** Map id → MediaRef của các file READY (file thiếu / PENDING bị bỏ qua) */
  async hydrate(ids: readonly string[], tx: Tx = this.prisma): Promise<MediaMap> {
    const unique = [...new Set(ids)];
    if (!unique.length) return {};
    const rows = await tx.mediaAsset.findMany({
      where: { id: { in: unique }, status: 'READY' },
      select: { id: true, url: true, kind: true },
    });
    const map: MediaMap = {};
    for (const r of rows) if (r.url) map[r.id] = { id: r.id, url: r.url, kind: r.kind } satisfies MediaRef;
    return map;
  }

  /**
   * Mọi id phải tồn tại, READY và (trừ ADMIN) thuộc về `user`; tuỳ chọn ép loại.
   * Dùng khi lưu config câu hỏi (GV) và câu trả lời (HS) → 400 MEDIA_NOT_READY kèm danh sách id lỗi.
   */
  async assertOwnedReady(
    ids: readonly string[],
    user: AuthUser,
    kind?: MediaKind,
    tx: Tx = this.prisma,
  ): Promise<void> {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const rows = await tx.mediaAsset.findMany({
      where: { id: { in: unique } },
      select: { id: true, status: true, ownerId: true, kind: true },
    });
    const ok = new Set(
      rows
        .filter((r) => r.status === 'READY')
        .filter((r) => user.role === 'ADMIN' || r.ownerId === user.id)
        .filter((r) => !kind || r.kind === kind)
        .map((r) => r.id),
    );
    const bad = unique.filter((id) => !ok.has(id));
    if (bad.length) throw new AppError('MEDIA_NOT_READY', 400, { details: { mediaIds: bad } });
  }

  /** Xoá file trên đĩa (không có thì bỏ qua) */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (e) {
      this.logger.warn(`Không xoá được ${key}: ${(e as Error).message}`);
    }
  }
}
