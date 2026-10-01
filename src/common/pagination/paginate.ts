import { type PageQuery, type Paginated, parseSort } from '@phonics/contracts';

export interface PageArgs {
  skip: number;
  take: number;
}

/** skip / take từ PageQuery */
export function pageArgs(query: Pick<PageQuery, 'page' | 'pageSize'>): PageArgs {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/**
 * Chạy count + findMany song song và đóng gói theo chuẩn Paginated.
 *   paginate(query, (args) => prisma.user.findMany({ where, ...args }), () => prisma.user.count({ where }))
 */
export async function paginate<T>(
  query: Pick<PageQuery, 'page' | 'pageSize'>,
  findMany: (args: PageArgs) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<Paginated<T>> {
  const [items, total] = await Promise.all([findMany(pageArgs(query)), count()]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/**
 * orderBy an toàn: chỉ nhận field trong whitelist, có mặc định.
 *   orderBy(query.sort, ['createdAt', 'displayName'], { createdAt: 'desc' })
 */
export function orderBy<F extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  fallback: Partial<Record<F, 'asc' | 'desc'>>,
): Partial<Record<F, 'asc' | 'desc'>> {
  const parsed = parseSort(sort);
  if (parsed && (allowed as readonly string[]).includes(parsed.field)) {
    return { [parsed.field]: parsed.dir } as Partial<Record<F, 'asc' | 'desc'>>;
  }
  return fallback;
}
