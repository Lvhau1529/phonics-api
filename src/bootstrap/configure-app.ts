import { VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { API_ROOT } from '@phonics/contracts';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware';
import { type Env } from '../config/env.schema';

/**
 * Cấu hình HTTP dùng chung cho `main.ts` và e2e (`test/helpers/create-test-app.ts`) — test chạy đúng
 * prefix / version / middleware như production.
 *
 * Thứ tự xử lý một request:
 *   middleware (request-id → helmet → cookie-parser → CORS → pino-http)
 *   → guard (Throttler → Jwt → Roles → Permissions, AppModule)
 *   → pipe (ZodValidationPipe) → controller → service
 *   → lỗi bất kỳ → AllExceptionsFilter (envelope ApiErrorBody)
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.setGlobalPrefix(API_ROOT.slice(1));
  // /api/v1/..., version khai báo ở từng controller (config/api-version.ts)
  app.enableVersioning({ type: VersioningType.URI });
  // Sau nginx / Caddy: lấy IP thật của client cho throttle + audit
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(helmet({ contentSecurityPolicy: false })); // Swagger UI cần inline script
  app.use(cookieParser(env.COOKIE_SECRET));
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });

  app.useGlobalFilters(new AllExceptionsFilter(env.NODE_ENV === 'production'));
}
