/**
 * Chuẩn hoá lại số điện thoại phụ huynh đã lưu (bảng `guardians`) theo luật mới của contracts (`normalizePhone`:
 * đầu số 11 số cũ → mới, `+84 0…`, `0084…`, quên số 0) và liệt kê số không hợp lệ để sửa tay ở admin.
 *   pnpm phones:normalize           # chỉ xem (không ghi)
 *   pnpm phones:normalize --apply   # ghi thay đổi
 * Dùng DATABASE_URL trong .env (chạy trong container API trên VPS: `docker compose exec api pnpm phones:normalize`).
 */
import 'dotenv/config';
import { isValidPhone, normalizePhone } from '@phonics/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  try {
    const rows = await prisma.guardian.findMany({
      where: { deletedAt: null, phone: { not: null } },
      select: { id: true, fullName: true, phone: true },
      orderBy: { fullName: 'asc' },
    });
    const changes = rows.flatMap((g) => {
      const next = normalizePhone(g.phone!);
      return next && next !== g.phone ? [{ ...g, next }] : [];
    });
    const invalid = rows.filter((g) => !isValidPhone(g.phone!));

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
