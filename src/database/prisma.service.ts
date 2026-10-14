import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV } from '@/config/env.module';
import { type Env } from '@/config/env.schema';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma 7 + driver adapter pg. Pool nhỏ (max 5): Postgres cùng VPS (service `db`), một instance API.
 * Mọi service inject PrismaService; transaction: `this.prisma.$transaction(async (tx) => …)`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 5 }),
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
