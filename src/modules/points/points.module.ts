import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PointsService } from './points.service';
import { RankingService } from './ranking.service';
import { ClassPointsController, MePointsController } from './v1/points.controller';

@Module({
  imports: [AuditModule],
  controllers: [MePointsController, ClassPointsController],
  providers: [PointsService, RankingService],
  exports: [PointsService, RankingService],
})
export class PointsModule {}
