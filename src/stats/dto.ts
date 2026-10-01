import { Bucket, RangeQuery, RankingQuery, TimelineQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Timeline điểm của lớp: bucket day|week, lọc theo kind / game */
export class TimelineQueryDto extends createZodDto(TimelineQuery) {}

/** Top học sinh: như RankingQuery + limit (mặc định 10, tối đa 100) */
export const TopStudentsQuery = RankingQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type TopStudentsQuery = z.infer<typeof TopStudentsQuery>;
export class TopStudentsQueryDto extends createZodDto(TopStudentsQuery) {}

/** Phân bố điểm: range + gameId */
export class DistributionQueryDto extends createZodDto(RankingQuery) {}

/** Timeline của một game (view / play): chỉ cần range + bucket */
export const GameTimelineQuery = RangeQuery.extend({ bucket: Bucket.default('day') });
export type GameTimelineQuery = z.infer<typeof GameTimelineQuery>;
export class GameTimelineQueryDto extends createZodDto(GameTimelineQuery) {}
