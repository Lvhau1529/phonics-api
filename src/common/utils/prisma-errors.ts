import { Prisma } from '@/generated/prisma/client';

/** Lỗi vi phạm ràng buộc unique của Prisma (P2002) — thường do hai request cùng ghi song song */
export function isUniqueViolation(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
