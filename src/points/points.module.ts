import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClassPointsController, MePointsController } from './points.controller';
import { PointsService } from './points.service';
import { RankingService } from './ranking.service';

@Module({
  imports: [AuditModule],
  controllers: [MePointsController, ClassPointsController],
  providers: [PointsService, RankingService],
  exports: [PointsService, RankingService],
})
export class PointsModule {}
