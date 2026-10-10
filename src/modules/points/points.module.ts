import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PointsClassController } from './controllers/points-class.controller';
import { PointsMeController } from './controllers/points-me.controller';
import { PointRepository } from './repositories/point.repository';
import { PointBonusService } from './services/point-bonus.service';
import { PointReaderService } from './services/point-reader.service';
import { RankingService } from './services/ranking.service';

@Module({
  imports: [AuditModule],
  controllers: [PointsMeController, PointsClassController],
  providers: [PointRepository, PointReaderService, PointBonusService, RankingService],
  exports: [PointReaderService, RankingService],
})
export class PointsModule {}
