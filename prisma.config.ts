// Cấu hình Prisma CLI (migrate / generate / seed). CLI dùng DIRECT_URL (kết nối thẳng, không qua pooler);
// runtime dùng DATABASE_URL (pooled) trong PrismaService.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` không cần kết nối DB (CI, Docker build không có .env) → chỉ khai báo datasource khi có DIRECT_URL;
// migrate / seed thiếu biến này vẫn báo lỗi.
const directUrl = process.env.DIRECT_URL;

// `prisma db seed`: dev chạy thẳng TS bằng tsx; ảnh production (NODE_ENV=production) không có tsx / src
// → chạy bản đã build `dist/seed.js` (nest build biên dịch src/seed.ts).
const seedCommand = process.env.NODE_ENV === 'production' ? 'node dist/seed.js' : 'tsx src/seed.ts';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: seedCommand,
  },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
