import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CoreModule } from './core/core.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassesModule } from './modules/classes/classes.module';
import { EventsModule } from './modules/events/events.module';
import { GameResultsModule } from './modules/game-results/game-results.module';
import { GamesModule } from './modules/games/games.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PointsModule } from './modules/points/points.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StatsModule } from './modules/stats/stats.module';
import { StudentsModule } from './modules/students/students.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Ghép ứng dụng: hạ tầng (CoreModule) + module nghiệp vụ (`modules/`) + pipe / guard toàn cục.
 *
 * Thứ tự guard toàn cục: Throttler → Jwt (gắn req.user) → Roles → Permissions.
 * Module nghiệp vụ @Global (dùng ở nhiều nơi): Notifications, Permissions, Auth — module khác phải `imports`.
 * Cấu hình HTTP (prefix, versioning, middleware, CORS, filter) ở `bootstrap/configure-app.ts`.
 */
@Module({
  imports: [
    CoreModule,
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
