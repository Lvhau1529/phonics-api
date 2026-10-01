import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { THROTTLE } from '../config/constants';
import { EnvModule } from '../config/env.module';
import { AccessModule } from './access/access.module';
import { PrismaModule } from './database/prisma.module';
import { LoggerModule } from './logger/logger.module';
import { TimeModule } from './time/time.module';

/**
 * Hạ tầng dùng chung, không chứa nghiệp vụ: env, log, rate limit, cron, DB (Prisma), thời gian (APP_TIMEZONE),
 * phạm vi dữ liệu theo vai trò (AccessService). Các provider là @Global → module nghiệp vụ inject thẳng.
 * Chỉ AppModule import CoreModule.
 */
@Module({
  imports: [
    EnvModule,
    LoggerModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: THROTTLE.default.ttl, limit: THROTTLE.default.limit }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    TimeModule,
    AccessModule,
  ],
})
export class CoreModule {}
