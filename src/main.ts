import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@phonics/contracts';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { SWAGGER_PATH, setupSwagger } from './bootstrap/swagger';
import { ENV } from './config/env.module';
import { type Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  configureApp(app, env);
  app.enableShutdownHooks();
  if (env.SWAGGER_ENABLED) setupSwagger(app);

  await app.listen(env.PORT);
  app.get(Logger).log(`API: http://localhost:${env.PORT}${API_PREFIX} (docs: ${SWAGGER_PATH})`);
}

void bootstrap();
