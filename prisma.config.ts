// Cấu hình Prisma CLI (migrate / generate / seed). CLI dùng DIRECT_URL (kết nối thẳng, không qua pooler);
// runtime dùng DATABASE_URL (pooled) trong PrismaService.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` không cần kết nối DB (CI, Docker build không có .env) → chỉ khai báo datasource khi có DIRECT_URL;
// migrate / seed thiếu biến này vẫn báo lỗi.
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
