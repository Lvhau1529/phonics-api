import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@phonics/contracts';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ENV } from './config/env.module';
import { type Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX.slice(1));
  // Sau nginx / Caddy: lấy IP thật của client cho throttle + audit
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false })); // Swagger UI cần inline script
  app.use(cookieParser(env.COOKIE_SECRET));
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });
  app.useGlobalFilters(new AllExceptionsFilter(env.NODE_ENV === 'production'));
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('Phonics Arcade API')
      .setDescription(
        'Tài khoản, lớp học, điểm, xếp hạng, thông báo, game, báo cáo. Lỗi theo envelope ApiErrorBody.',
      )
      .setVersion('1')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(doc), { jsonDocumentUrl: 'api/docs-json' });
  }

  await app.listen(env.PORT);
  app.get(Logger).log(`API: http://localhost:${env.PORT}${API_PREFIX} (docs: ${API_PREFIX}/docs)`);
}

void bootstrap();
