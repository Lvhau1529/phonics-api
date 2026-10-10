/**
 * Seed (`prisma db seed`): dev → `tsx src/database/seeds/seed.ts`; production → `node dist/database/seeds/seed.js`
 * (nest build biên dịch cả thư mục này). Không dùng Nest: PrismaClient + adapter pg trực tiếp.
 *
 * Luôn chạy (idempotent): admin (`admin.seed.ts`), catalog game (`games.seed.ts`), nhóm quyền hệ thống
 * (`permission-groups.seed.ts`).
 * Khi SEED_DEMO=true và NODE_ENV !== 'production': lớp / học sinh / điểm demo (`demo-classes.seed.ts`) và phiếu bài tập
 * mẫu (`demo-worksheets.seed.ts`). Tài khoản demo: xem README.md.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { seedAdmin } from './admin.seed';
import { seedDemoClasses } from './demo-classes.seed';
import { seedDemoWorksheets } from './demo-worksheets.seed';
import { seedGames } from './games.seed';
import { seedPermissionGroups } from './permission-groups.seed';
import { connectionString } from './seed-helpers';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString(), max: 3 }),
  });
  try {
    await seedAdmin(prisma);
    await seedGames(prisma);
    await seedPermissionGroups(prisma);
    if (process.env.SEED_DEMO === 'true') {
      if (process.env.NODE_ENV === 'production') console.log('[seed] demo: bỏ qua vì NODE_ENV=production');
      else {
        await seedDemoClasses(prisma);
        await seedDemoWorksheets(prisma);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] lỗi:', error);
  process.exitCode = 1;
});
