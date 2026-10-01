// Cấu hình Prisma CLI (migrate / generate / seed). CLI dùng DIRECT_URL (kết nối thẳng, không qua pooler);
// runtime dùng DATABASE_URL (pooled) trong PrismaService.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
