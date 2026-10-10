import { type Provider } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ENV } from '../../config/env.module';
import { type Env } from '../../config/env.schema';

/** Token inject S3 client; `null` khi chưa cấu hình AWS_* (unit test, CI, môi trường chưa bật upload) */
export const S3_CLIENT = Symbol('S3_CLIENT');

export type S3ClientOrNull = S3Client | null;

/** Dựng S3Client từ Env (không đọc process.env ngầm). Neon Object Storage bắt buộc path-style. */
export function createS3Client(env: Env): S3ClientOrNull {
  if (!env.AWS_ENDPOINT_URL_S3 || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_REGION) {
    return null;
  }
  return new S3Client({
    endpoint: env.AWS_ENDPOINT_URL_S3,
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  });
}

export const s3ClientProvider: Provider = {
  provide: S3_CLIENT,
  inject: [ENV],
  useFactory: (env: Env): S3ClientOrNull => createS3Client(env),
};
