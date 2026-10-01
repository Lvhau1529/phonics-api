import { RankingQuery, TimelineQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';
import { GameTimelineQuery, TopStudentsQuery } from '../stats.schemas';

/** Timeline điểm của lớp: bucket day|week, lọc theo kind / game */
export class TimelineQueryDto extends createZodDto(TimelineQuery) {}

/** Top học sinh: như RankingQuery + limit (mặc định 10, tối đa 100) */
export class TopStudentsQueryDto extends createZodDto(TopStudentsQuery) {}

/** Phân bố điểm: range + gameId */
export class DistributionQueryDto extends createZodDto(RankingQuery) {}

/** Timeline của một game (view / play): chỉ cần range + bucket */
export class GameTimelineQueryDto extends createZodDto(GameTimelineQuery) {}
