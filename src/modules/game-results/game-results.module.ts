import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GamesModule } from '../games/games.module';
import { PointsModule } from '../points/points.module';
import { GameResultsService } from './game-results.service';
import { GameResultsController, MeGameResultsController } from './v1/game-results.controller';

@Module({
  imports: [PointsModule, GamesModule, EventsModule],
  controllers: [GameResultsController, MeGameResultsController],
  providers: [GameResultsService],
})
export class GameResultsModule {}
