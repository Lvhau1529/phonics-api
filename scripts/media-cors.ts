/**
 * Đặt CORS cho bucket media (một lần cho mỗi Neon branch, sau `neon deploy`):
 *   pnpm media:cors
 * Cho phép game / admin (CORS_ORIGINS) PUT thẳng lên presigned URL với header Content-Type / Cache-Control.
 */
import 'dotenv/config';
import { GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { validateEnv } from '../src/config/env.schema';
import { createS3Client } from '../src/infrastructure/storage/storage.provider';

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const s3 = createS3Client(env);
  if (!s3) throw new Error('Thiếu AWS_* trong .env (chạy `neon env pull` trước)');
  if (!env.CORS_ORIGINS.length) throw new Error('CORS_ORIGINS trống');

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: env.MEDIA_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: env.CORS_ORIGINS,
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['content-type', 'cache-control'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  const current = await s3.send(new GetBucketCorsCommand({ Bucket: env.MEDIA_BUCKET }));
  console.log(`CORS bucket ${env.MEDIA_BUCKET}:`, JSON.stringify(current.CORSRules, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
