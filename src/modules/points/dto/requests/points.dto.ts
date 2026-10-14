import { AwardBonusBatchBody, AwardBonusBody, PointsListQuery, RankingQuery } from '@phonics/contracts';
import { createZodDto } from 'nestjs-zod';

export class RankingQueryDto extends createZodDto(RankingQuery) {}
export class PointsListQueryDto extends createZodDto(PointsListQuery) {}
export class AwardBonusDto extends createZodDto(AwardBonusBody) {}
export class AwardBonusBatchDto extends createZodDto(AwardBonusBatchBody) {}
