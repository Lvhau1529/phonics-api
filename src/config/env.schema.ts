import { z } from 'zod';

const csv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Nguồn sự thật duy nhất cho biến môi trường của API (validate khi khởi động; thiếu / sai → không chạy) */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_TIMEZONE: z.string().min(1).default('Asia/Ho_Chi_Minh'),
    /** Pooled (runtime) */
    DATABASE_URL: z.url(),
    /** Direct (prisma migrate) — chỉ CLI dùng, validate để .env đủ cặp */
    DIRECT_URL: z.url().optional(),
    JWT_ACCESS_SECRET: z.string().min(32),
    /** Dạng của jsonwebtoken: '15m', '1h' */
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+[smhd]$/)
      .default('15m'),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_SECRET: z.string().min(32),
    COOKIE_DOMAIN: z.string().min(1).optional(),
    CORS_ORIGINS: z.string().default('').transform(csv),
    GOOGLE_CLIENT_IDS: z.string().default('').transform(csv),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(8),
    SEED_DEMO: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    /**
     * Neon Object Storage (S3-compatible) cho ảnh / audio phiếu bài tập — `neon env pull` điền 4 biến AWS_*.
     * Thiếu cả 4 = tắt upload (API vẫn chạy, endpoint media trả 503 MEDIA_STORAGE_DISABLED).
     */
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    AWS_ENDPOINT_URL_S3: z.url().optional(),
    AWS_REGION: z.string().min(1).optional(),
    MEDIA_BUCKET: z.string().min(1).default('resources'),
    /** CDN / domain public đứng trước bucket; mặc định `${AWS_ENDPOINT_URL_S3}/${MEDIA_BUCKET}` */
    MEDIA_PUBLIC_BASE_URL: z.url().optional(),
    MEDIA_PRESIGN_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
  })
  .superRefine((env, ctx) => {
    const aws = [env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY, env.AWS_ENDPOINT_URL_S3, env.AWS_REGION];
    const set = aws.filter(Boolean).length;
    if (set !== 0 && set !== aws.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['AWS_ENDPOINT_URL_S3'],
        message:
          'Cần đủ 4 biến AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_ENDPOINT_URL_S3 / AWS_REGION (hoặc bỏ cả 4)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Dùng bởi ConfigModule.forRoot({ validate }) — ném lỗi đọc được khi thiếu biến */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Biến môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  return result.data;
}
