import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GamesModule } from '../games/games.module';
import { PointsModule } from '../points/points.module';
import { GameResultsMeController } from './controllers/game-results-me.controller';
import { GameResultsController } from './controllers/game-results.controller';
import { GameResultRepository } from './repositories/game-result.repository';
import { GameResultReaderService } from './services/game-result-reader.service';
import { GameResultWriterService } from './services/game-result-writer.service';

@Module({
  imports: [PointsModule, GamesModule, EventsModule],
  controllers: [GameResultsController, GameResultsMeController],
  providers: [GameResultRepository, GameResultWriterService, GameResultReaderService],
})
export class GameResultsModule {}
