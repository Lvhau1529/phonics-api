import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { type IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './common/access/access.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TimeModule } from './common/time/time.module';
import { THROTTLE } from './config/constants';
import { ENV, EnvModule } from './config/env.module';
import { type Env } from './config/env.schema';
import { ClassesModule } from './classes/classes.module';
import { EventsModule } from './events/events.module';
import { GameResultsModule } from './game-results/game-results.module';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PointsModule } from './points/points.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { StatsModule } from './stats/stats.module';
import { StudentsModule } from './students/students.module';
import { TeachersModule } from './teachers/teachers.module';
import { UsersModule } from './users/users.module';

/**
 * Thứ tự guard toàn cục: Throttler → Jwt (gắn req.user) → Roles → Permissions.
 * Module hạ tầng (Env, Prisma, Time, Access, Notifications, Permissions, Auth) là @Global.
 */
@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req: IncomingMessage) =>
            (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          autoLogging: { ignore: (req: IncomingMessage) => req.url === '/api/health' },
        },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: THROTTLE.default.ttl, limit: THROTTLE.default.limit }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    TimeModule,
    AccessModule,
    AuditModule,
    NotificationsModule,
    PermissionsModule,
    UsersModule,
    PointsModule,
    AuthModule,
    ClassesModule,
    TeachersModule,
    StudentsModule,
    GamesModule,
    EventsModule,
    GameResultsModule,
    ReportsModule,
    StatsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
