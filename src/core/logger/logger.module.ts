import { randomUUID } from 'node:crypto';
import { type IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { API_ROOT, ENDPOINTS } from '@phonics/contracts';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { REQUEST_ID_HEADER } from '../../common/middleware/request-id.middleware';
import { ENV } from '../../config/env.module';
import { type Env } from '../../config/env.schema';

const HEALTH_URL = `${API_ROOT}${ENDPOINTS.health}`;

/**
 * Log JSON bằng pino (pino-pretty khi dev). Mã request lấy từ `requestIdMiddleware`;
 * không log secret (authorization / cookie / set-cookie bị redact), bỏ qua log của health check.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req: IncomingMessage) =>
            (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID(),
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          autoLogging: { ignore: (req: IncomingMessage) => req.url === HEALTH_URL },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
