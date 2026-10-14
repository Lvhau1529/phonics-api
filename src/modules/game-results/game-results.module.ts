import { Module } from '@nestjs/common';
import { EventsModule } from '@/modules/events/events.module';
import { GamesModule } from '@/modules/games/games.module';
import { PointsModule } from '@/modules/points/points.module';
import { GameResultsMeController } from '@/modules/game-results/controllers/game-results-me.controller';
import { GameResultsController } from '@/modules/game-results/controllers/game-results.controller';
import { GameResultRepository } from '@/modules/game-results/repositories/game-result.repository';
import { GameResultReaderService } from '@/modules/game-results/services/game-result-reader.service';
import { GameResultWriterService } from '@/modules/game-results/services/game-result-writer.service';

@Module({
  imports: [PointsModule, GamesModule, EventsModule],
  controllers: [GameResultsController, GameResultsMeController],
  providers: [GameResultRepository, GameResultWriterService, GameResultReaderService],
})
export class GameResultsModule {}
