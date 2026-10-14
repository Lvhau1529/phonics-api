import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/database/prisma.service';

/**
 * Health check. `/api/health` chỉ kiểm process (liveness, KHÔNG chạm DB) — Docker HEALTHCHECK (30 s) / uptime monitor
 * gọi liên tục mà không tạo tải lên DB. Kiểm tra cả DB dùng `/api/health/db` (CI sau deploy).
 */
@ApiTags('public')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /api/health — process còn sống (liveness) */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }

  /** GET /api/health/db — có kết nối DB (readiness) */
  @Get('db')
  @HealthCheck()
  checkDb() {
    return this.health.check([() => this.db.pingCheck('database', this.prisma)]);
  }
}
