/**
 * Schema query riêng của thống kê (chưa có trong contracts). Không phụ thuộc version:
 * service dùng kiểu ở đây, DTO của từng version (`v1/dto.ts`) bọc lại bằng createZodDto.
 */
import { Bucket, RangeQuery, RankingQuery } from '@phonics/contracts';
import { z } from 'zod';

/** Top học sinh: như RankingQuery + limit (mặc định 10, tối đa 100) */
export const TopStudentsQuery = RankingQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type TopStudentsQuery = z.infer<typeof TopStudentsQuery>;

/** Timeline của một game (view / play): chỉ cần range + bucket */
export const GameTimelineQuery = RangeQuery.extend({ bucket: Bucket.default('day') });
export type GameTimelineQuery = z.infer<typeof GameTimelineQuery>;
