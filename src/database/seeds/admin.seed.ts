import { type PrismaClient } from '@/generated/prisma/client';
import { hashPassword } from '@/database/seeds/seed-helpers';

/** ADMIN từ ADMIN_EMAIL / ADMIN_PASSWORD (không ghi đè mật khẩu đã có, trừ khi SEED_RESET_ADMIN_PASSWORD=true) */
export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Thiếu ADMIN_EMAIL / ADMIN_PASSWORD trong .env');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        emailVerified: true,
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
        displayName: 'Admin',
      },
    });
    console.log(`[seed] admin: tạo mới ${email}`);
    return;
  }
  if (process.env.SEED_RESET_ADMIN_PASSWORD === 'true') {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } },
    });
    console.log(`[seed] admin: đã đặt lại mật khẩu ${email} (SEED_RESET_ADMIN_PASSWORD=true)`);
    return;
  }
  console.log(`[seed] admin: ${email} đã tồn tại (giữ nguyên mật khẩu)`);
}
