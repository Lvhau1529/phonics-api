/**
 * Khởi động AppModule cho e2e với cùng cấu hình HTTP như src/main.ts (`configureApp`: prefix /api, versioning
 * /api/v1, middleware, CORS, AllExceptionsFilter). DB test lấy từ DATABASE_URL_TEST — gọi `useTestDatabase()` ở đầu file
 * test (trước khi import AppModule) để đặt DATABASE_URL; không có biến này thì test tự skip.
 */
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type Env } from '../../src/config/env.schema';
import { type PrismaService } from '../../src/core/database/prisma.service';

const API_ROOT = path.resolve(__dirname, '../..');

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  /** Server HTTP cho supertest: `request(t.server).post(`${API_PREFIX}/auth/login`)` */
  server: ReturnType<NestExpressApplication['getHttpServer']>;
  close(): Promise<void>;
}

/**
 * Trỏ DATABASE_URL / DIRECT_URL sang DATABASE_URL_TEST và điền giá trị mặc định cho các biến bắt buộc còn thiếu
 * (CI không có .env). Trả về false nếu không có DB test → `describe.skipIf(!useTestDatabase())`.
 */
export function useTestDatabase(): boolean {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) return false;
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL ??= 'warn';
  process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-e2e-access-secret-e2e';
  process.env.COOKIE_SECRET ??= 'e2e-cookie-secret-e2e-cookie-secret-e2e';
  process.env.ADMIN_EMAIL ??= 'admin@e2e.local';
  process.env.ADMIN_PASSWORD ??= 'e2e-admin-password';
  process.env.CORS_ORIGINS ??= 'http://localhost:5173';
  process.env.GOOGLE_CLIENT_IDS ??= '';
  process.env.SWAGGER_ENABLED = 'false';
  return true;
}

/** `prisma migrate deploy` lên DB test (DIRECT_URL đã trỏ sang DATABASE_URL_TEST) */
export function applyMigrations(): void {
  const bin = path.join(
    API_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  execFileSync(bin, ['migrate', 'deploy'], {
    cwd: API_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

export async function createTestApp(): Promise<TestApp> {
  // Import động để env (useTestDatabase) được đặt trước khi EnvModule đọc process.env
  const [{ AppModule }, { configureApp }, { PrismaService }, { ENV }] = await Promise.all([
    import('../../src/app.module.js'),
    import('../../src/bootstrap/configure-app.js'),
    import('../../src/core/database/prisma.service.js'),
    import('../../src/config/env.module.js'),
  ]);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: false, logger: false });
  configureApp(app, app.get(ENV) as Env);
  await app.init();

  const prisma = app.get(PrismaService);
  return {
    app,
    prisma,
    server: app.getHttpServer(),
    close: () => app.close(),
  };
}

/** Xoá sạch dữ liệu mọi bảng (giữ schema + bảng _prisma_migrations) */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = [
    'audit_logs',
    'notifications',
    'refresh_tokens',
    'user_permissions',
    'point_entries',
    'game_results',
    'game_events',
    'student_game_unlocks',
    'class_memberships',
    'class_teachers',
    'student_profiles',
    'classes',
    'games',
    'users',
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
