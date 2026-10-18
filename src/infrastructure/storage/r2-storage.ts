import {
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { WORKSHEETS } from '@/config/constants';
import { type Env } from '@/config/env.schema';
import {
  MediaStorage,
  type PresignedPut,
  type PresignPutInput,
  type StoredObject,
} from '@/infrastructure/storage/media-storage';

type R2Env = Pick<
  Env,
  'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET' | 'MEDIA_PUBLIC_BASE_URL'
>;

/** Client S3 trỏ tới endpoint R2 của account (dùng chung cho `R2Storage` và script `media:cors`) */
export function createR2Client(
  env: Pick<Env, 'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY'>,
): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    // Mặc định SDK gắn checksum CRC32 (của body rỗng lúc ký) vào presigned URL → PUT thật luôn lệch checksum
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
}

/**
 * Lưu file media trên Cloudflare R2 (API tương thích S3). Client PUT thẳng lên presigned URL của R2 — API không
 * chạm byte; file public qua custom domain / r2.dev của bucket (`MEDIA_PUBLIC_BASE_URL`). Bucket cần CORS cho
 * phép PUT từ origin của game / admin (`pnpm media:cors`, README > Media trên Cloudflare R2).
 */
export class R2Storage extends MediaStorage {
  readonly publicBaseUrl: string;
  private readonly bucket: string;

  constructor(
    env: R2Env,
    private readonly s3: S3Client = createR2Client(env),
  ) {
    super();
    this.bucket = env.R2_BUCKET!;
    this.publicBaseUrl = env.MEDIA_PUBLIC_BASE_URL!;
  }

  /**
   * Ký cả Content-Type và Content-Length: client không đổi được loại file, và R2 từ chối (403) mọi body khác
   * đúng `sizeBytes` đã khai — chặn file vượt MEDIA_LIMITS ngay lúc PUT, không phải đợi complete. Content-Length
   * không nằm trong `headers` trả về: trình duyệt tự gửi (header cấm, XHR không cho đặt).
   */
  async presignPut({ key, mimeType, sizeBytes, expiresInSec }: PresignPutInput): Promise<PresignedPut> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
      CacheControl: WORKSHEETS.mediaCacheControl,
    });
    const url = await getSignedUrl(this.s3, command, {
      expiresIn: expiresInSec,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { url, headers: { 'Content-Type': mimeType, 'Cache-Control': WORKSHEETS.mediaCacheControl } };
  }

  /** Không dùng: presign luôn trả link R2 nên không có link PUT qua API */
  write(): Promise<number> {
    return Promise.reject(new Error('R2Storage không nhận upload qua API'));
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
    } catch (e) {
      if (e instanceof NotFound || (e as { name?: string }).name === 'NotFound') return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
