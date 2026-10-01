import { z } from 'zod';

export const PAGE_SIZE_MAX = 100;

/** Query phân trang + sắp xếp + tìm kiếm chung cho mọi danh sách */
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
  /** `field:asc` | `field:desc` — mỗi endpoint có whitelist field riêng */
  sort: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9.]*:(asc|desc)$/, 'sort phải có dạng field:asc|desc')
    .optional(),
  /** Tìm kiếm tự do (tên, email...) */
  q: z.string().trim().max(100).optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Schema cho response phân trang của một kiểu item */
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: z.int().min(0), page: z.int().min(1), pageSize: z.int().min(1) });

/** Tách `sort=field:dir` (đã validate bằng PageQuery) */
export function parseSort(sort: string | undefined): { field: string; dir: 'asc' | 'desc' } | undefined {
  if (!sort) return undefined;
  const [field, dir] = sort.split(':');
  return { field, dir: dir === 'asc' ? 'asc' : 'desc' };
}
