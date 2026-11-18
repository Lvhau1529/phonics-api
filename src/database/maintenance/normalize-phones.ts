/**
 * Chuẩn hoá lại số điện thoại phụ huynh đã lưu (bảng `guardians`) theo luật mới của contracts (`normalizePhone`:
 * đầu số 11 số cũ → mới, `+84 0…`, `0084…`, quên số 0) và liệt kê số không hợp lệ để sửa tay ở admin.
 *   pnpm phones:normalize           # dev: chỉ xem (không ghi)
 *   pnpm phones:normalize --apply   # dev: ghi thay đổi
 * Production: ảnh Docker không có pnpm / tsx / src — chạy bản đã build (nest build biên dịch cả thư mục này):
 *   docker compose exec api node dist/database/maintenance/normalize-phones.js [--apply]
 * Kết nối: DIRECT_URL / DATABASE_URL (dev đọc .env, container API có sẵn biến).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { planPhoneChanges } from '@/database/maintenance/phone-changes';
import { connectionString } from '@/database/seeds/seed-helpers';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString(), max: 1 }),
  });
  try {
    const rows = await prisma.guardian.findMany({
      where: { deletedAt: null, phone: { not: null } },
      select: { id: true, fullName: true, phone: true },
      orderBy: { fullName: 'asc' },
    });
    const { changes, invalid } = planPhoneChanges(
      rows.flatMap((g) => (g.phone ? [{ id: g.id, fullName: g.fullName, phone: g.phone }] : [])),
    );

    for (const c of changes) console.log(`  ${c.fullName}: ${c.phone} → ${c.next}`);
    console.log(`[phones] ${rows.length} số, ${changes.length} số cần chuẩn hoá`);
    if (invalid.length) {
      console.log(`[phones] ${invalid.length} số không hợp lệ (sửa tay ở admin > Phụ huynh):`);
      for (const g of invalid) console.log(`  ${g.fullName}: ${g.phone}`);
    }
    if (!apply) {
      if (changes.length) console.log('[phones] Chạy lại với --apply để ghi.');
      return;
    }
    await prisma.$transaction(
      changes.map((c) => prisma.guardian.update({ where: { id: c.id }, data: { phone: c.next } })),
    );
    console.log(`[phones] Đã cập nhật ${changes.length} số.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[phones] lỗi:', error);
  process.exit(1);
});
