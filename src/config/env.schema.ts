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
    /** Postgres (VPS: service `db` trong docker-compose; dev: Postgres local của phonics-dev) */
    DATABASE_URL: z.url(),
    /** Kết nối cho Prisma CLI (migrate / seed); thường trùng DATABASE_URL */
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
     * URL public của API (không có `/api`), dùng để dựng link upload / link file trả cho client — vd
     * `https://api.example.vn`. Bắt buộc ở production; dev mặc định `http://localhost:${PORT}`.
     */
    API_PUBLIC_URL: z.url().optional(),
    /** Thư mục lưu ảnh / audio phiếu bài tập (ADR 0024). Docker: volume `/data/media`. */
    MEDIA_DIR: z.string().min(1).default('storage/media'),
    /** CDN / domain riêng đứng trước file media; mặc định `${API_PUBLIC_URL}/files` (API tự phục vụ) */
    MEDIA_PUBLIC_BASE_URL: z.url().optional(),
    /** Hạn của link upload đã ký (giây) */
    MEDIA_PRESIGN_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.API_PUBLIC_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_PUBLIC_URL'],
        message: 'Production cần API_PUBLIC_URL (vd https://api.example.vn) để dựng link upload / file media',
      });
    }
  })
  .transform((env) => ({
    ...env,
    API_PUBLIC_URL: (env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, ''),
  }));

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
