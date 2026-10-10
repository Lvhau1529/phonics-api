import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
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
import { AppError, notFound } from '../../../common/errors/app-error';
import { WORKSHEETS } from '../../../config/constants';
import { ENV } from '../../../config/env.module';
import { type Env } from '../../../config/env.schema';
import { PrismaService } from '../../../database/prisma.service';
import { type Tx } from '../../../database/types';
import { S3_CLIENT, type S3ClientOrNull } from '../../../infrastructure/storage/storage.provider';
import { type AuthUser } from '../../auth/types/auth.types';
import { toMediaView } from '../dto/responses/media.view';
import { buildObjectKey } from '../utils/media-key';

/**
 * Media (ảnh / audio) trên Neon Object Storage — ADR 0018.
 * API không chạm byte: presign PUT → client tải thẳng → complete (HEAD kiểm size / mime) → READY.
 * Mọi response có media đi kèm `media: MediaMap` qua `hydrate()` — điểm thay đổi duy nhất nếu sau này
 * chuyển sang bucket private + signed GET.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(S3_CLIENT) private readonly s3: S3ClientOrNull,
  ) {}

  get enabled(): boolean {
    return this.s3 !== null;
  }

  /** URL public của một key (bucket public_read, hoặc CDN qua MEDIA_PUBLIC_BASE_URL) */
  publicUrl(key: string): string {
    const base = this.env.MEDIA_PUBLIC_BASE_URL ?? `${this.env.AWS_ENDPOINT_URL_S3}/${this.env.MEDIA_BUCKET}`;
    return `${base.replace(/\/+$/, '')}/${key}`;
  }

  private requireS3(): NonNullable<S3ClientOrNull> {
    if (!this.s3) throw new AppError('MEDIA_STORAGE_DISABLED', 503);
    return this.s3;
  }

  /** Tạo bản ghi PENDING + URL PUT đã ký. Client phải gửi đúng `headers` trả về. */
  async presign(user: AuthUser, body: PresignMediaBody): Promise<PresignMediaResponse> {
    const s3 = this.requireS3();
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
    const command = new PutObjectCommand({
      Bucket: this.env.MEDIA_BUCKET,
      Key: key,
      ContentType: mimeType,
      CacheControl: WORKSHEETS.mediaCacheControl,
    });
    const expiresIn = this.env.MEDIA_PRESIGN_TTL_SEC;
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
    return {
      mediaId: row.id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': mimeType, 'Cache-Control': WORKSHEETS.mediaCacheControl },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Xác nhận đã PUT xong: HEAD đối tượng, kiểm size / mime theo MEDIA_LIMITS; sai → xoá đối tượng, 409.
   * Idempotent: đã READY thì trả luôn.
   */
  async complete(user: AuthUser, id: string, body: CompleteMediaBody): Promise<MediaView> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row) throw notFound('Không tìm thấy file');
    if (row.ownerId !== user.id && user.role !== 'ADMIN') throw new AppError('FORBIDDEN_SCOPE', 403);
    if (row.status === 'READY') return toMediaView(row);

    const s3 = this.requireS3();
    const bucket = this.env.MEDIA_BUCKET;
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: row.key })).catch((e: Error) => {
      this.logger.warn(`HEAD ${row.key} thất bại: ${e.message}`);
      throw new AppError('MEDIA_UPLOAD_INCOMPLETE', 409);
    });
    const size = head.ContentLength ?? 0;
    const contentType = baseMimeType(head.ContentType ?? '');

    const limit = MEDIA_LIMITS[row.kind].maxBytes;
    if (size <= 0 || size > limit || contentType !== row.mimeType) {
      await this.deleteObject(row.key);
      throw new AppError('MEDIA_UPLOAD_INCOMPLETE', 409, {
        details: {
          sizeBytes: size > limit ? ['File quá lớn'] : [],
          mimeType: contentType !== row.mimeType ? ['Định dạng không khớp lúc presign'] : [],
        },
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
    if (!row) throw notFound('Không tìm thấy file');
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

  /** Xoá đối tượng trên bucket (bỏ qua lỗi NoSuchKey) */
  async deleteObject(key: string): Promise<void> {
    if (!this.s3) return;
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.env.MEDIA_BUCKET, Key: key }));
    } catch (e) {
      this.logger.warn(`Không xoá được ${key}: ${(e as Error).message}`);
    }
  }
}
