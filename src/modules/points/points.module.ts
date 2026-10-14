import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { PointsClassController } from '@/modules/points/controllers/points-class.controller';
import { PointsMeController } from '@/modules/points/controllers/points-me.controller';
import { PointRepository } from '@/modules/points/repositories/point.repository';
import { PointBonusService } from '@/modules/points/services/point-bonus.service';
import { PointReaderService } from '@/modules/points/services/point-reader.service';
import { RankingService } from '@/modules/points/services/ranking.service';

@Module({
  imports: [AuditModule],
  controllers: [PointsMeController, PointsClassController],
  providers: [PointRepository, PointReaderService, PointBonusService, RankingService],
  exports: [PointReaderService, RankingService],
})
export class PointsModule {}
