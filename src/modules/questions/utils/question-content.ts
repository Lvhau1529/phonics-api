/** Hàm thuần về nội dung / phạm vi câu hỏi — dùng chung cho questions và worksheets */
import { type MediaMap, type MediaRef, collectMediaIds } from '@phonics/contracts';
import { type Prisma } from '@/generated/prisma/client';
import { type AuthUser } from '@/modules/auth/types/auth.types';

/** GV thấy câu của mình ∪ câu SHARED đã PUBLISHED; ADMIN thấy tất cả */
export function questionVisibleWhere(user: AuthUser): Prisma.QuestionWhereInput {
  if (user.role === 'ADMIN') return {};
  return { OR: [{ createdById: user.id }, { visibility: 'SHARED', status: 'PUBLISHED' }] };
}

/** Mọi id media trong nội dung một câu (config + ví dụ) */
export function questionMediaIds(config: unknown, example: unknown): string[] {
  return [...new Set([...collectMediaIds(config), ...collectMediaIds(example)])];
}

/** Ảnh đại diện: ảnh đầu tiên (theo thứ tự xuất hiện trong config) có trong map media */
export function thumbnailOf(config: unknown, media: MediaMap): MediaRef | null {
  for (const id of collectMediaIds(config)) {
    const ref = media[id];
    if (ref?.kind === 'IMAGE') return ref;
  }
  return null;
}

/** Tag chữ thường, bỏ trùng */
export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
}
