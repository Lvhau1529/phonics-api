import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GamesModule } from '../games/games.module';
import { PointsModule } from '../points/points.module';
import { GameResultsController, MeGameResultsController } from './game-results.controller';
import { GameResultsService } from './game-results.service';

@Module({
  imports: [PointsModule, GamesModule, EventsModule],
  controllers: [GameResultsController, MeGameResultsController],
  providers: [GameResultsService],
})
export class GameResultsModule {}
