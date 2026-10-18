/**
 * Đặt CORS cho bucket R2 chứa media (chạy lại mỗi khi đổi CORS_ORIGINS):
 *   pnpm media:cors
 * Cho phép game / admin (CORS_ORIGINS) PUT thẳng lên presigned URL với header Content-Type / Cache-Control.
 * Đọc .env (MEDIA_STORAGE=r2 + R2_*). Token R2 cần quyền Admin Read & Write để sửa CORS — hoặc đặt tay trên
 * dashboard (R2 > bucket > Settings > CORS Policy) bằng JSON in ra ở cuối.
 */
import 'dotenv/config';
import { GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { validateEnv } from '@/config/env.schema';
import { createR2Client } from '@/infrastructure/storage/r2-storage';

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  if (env.MEDIA_STORAGE !== 'r2') throw new Error('Cần MEDIA_STORAGE=r2 và R2_* trong .env');
  if (!env.CORS_ORIGINS.length) throw new Error('CORS_ORIGINS trống');
  const s3 = createR2Client(env);
  const Bucket = env.R2_BUCKET!;

  await s3.send(
    new PutBucketCorsCommand({
      Bucket,
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
  const current = await s3.send(new GetBucketCorsCommand({ Bucket }));
  console.log(`CORS bucket ${Bucket}:`, JSON.stringify(current.CORSRules, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
