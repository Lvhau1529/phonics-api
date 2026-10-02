import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// unplugin-swc: phát decorator metadata để Nest DI hoạt động trong test
const swcPlugin = swc.vite({
  module: { type: 'es6' },
  jsc: { transform: { legacyDecorator: true, decoratorMetadata: true } },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    projects: [
      {
        plugins: [swcPlugin],
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          environment: 'node',
          // Unit test mock Prisma, không cần secret thật; EnvModule vẫn validate env khi import → giá trị test cố định
          // (CI không có .env; dotenv không ghi đè biến đã có)
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://unit:unit@localhost:5432/unit',
            JWT_ACCESS_SECRET: 'unit-test-access-secret-unit-test-access',
            COOKIE_SECRET: 'unit-test-cookie-secret-unit-test-cookie',
            ADMIN_EMAIL: 'admin@unit.test',
            ADMIN_PASSWORD: 'unit-test-password',
          },
        },
      },
      {
        plugins: [swcPlugin],
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
