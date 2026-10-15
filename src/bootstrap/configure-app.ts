import { resolve } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { API_ROOT } from '@phonics/contracts';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { configureZodLocale } from '@/common/i18n/zod-locale';
import { localeMiddleware } from '@/common/middleware/locale.middleware';
import { requestIdMiddleware } from '@/common/middleware/request-id.middleware';
import { WORKSHEETS } from '@/config/constants';
import { type Env } from '@/config/env.schema';

/**
 * Cấu hình HTTP dùng chung cho `main.ts` và e2e (`test/helpers/create-test-app.ts`) — test chạy đúng
 * prefix / version / middleware như production.
 *
 * Thứ tự xử lý một request:
 *   (file media `/files/*` → trả thẳng từ MEDIA_DIR, không qua phần dưới)
 *   middleware (request-id → locale → helmet → cookie-parser → CORS → pino-http)
 *   → guard (Throttler → Jwt → Roles → Permissions, AppModule)
 *   → pipe (ZodValidationPipe) → controller → service
 *   → lỗi bất kỳ → AllExceptionsFilter (envelope ApiErrorBody)
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.setGlobalPrefix(API_ROOT.slice(1));
  // Config câu hỏi (ô chữ, lưới tìm từ) và autosave câu trả lời lớn hơn mặc định 100 kB của Express
  app.useBodyParser('json', { limit: '1mb' });
  // /api/v1/..., version khai báo ở từng controller (config/api-version.ts)
  app.enableVersioning({ type: VersioningType.URI });
  // Sau nginx / Caddy: lấy IP thật của client cho throttle + audit
  app.set('trust proxy', 1);

  // File media đã upload (ADR 0024): public, tên bất biến (uuid) → cache 1 năm; mọi origin đọc được (<img>, <audio>,
  // canvas). Đặt trước helmet để không bị gắn Cross-Origin-Resource-Policy: same-origin.
  app.useStaticAssets(resolve(env.MEDIA_DIR), {
    prefix: WORKSHEETS.mediaFilesPath,
    index: false,
    dotfiles: 'ignore',
    immutable: true,
    maxAge: '365d',
    setHeaders: (res, path) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // .webm chỉ sinh từ audio/webm (MEDIA_EXT) — mặc định express đoán video/webm
      if (path.endsWith('.webm')) res.setHeader('Content-Type', 'audio/webm');
    },
  });

  app.use(requestIdMiddleware);
  // Message lỗi theo Accept-Language (ADR 0025): middleware gắn locale, zod sinh message mặc định theo locale đó
  configureZodLocale();
  app.use(localeMiddleware);
  app.use(helmet({ contentSecurityPolicy: false })); // Swagger UI cần inline script
  app.use(cookieParser(env.COOKIE_SECRET));
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });

  app.useGlobalFilters(new AllExceptionsFilter(env.NODE_ENV === 'production'));
}
