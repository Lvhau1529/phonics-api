import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminGamesController } from './admin-games.controller';
import { ClassGamesController } from './class-games.controller';
import { GamesService } from './games.service';
import { MeGamesController } from './me-games.controller';
import { PublicGamesController } from './public-games.controller';
import { StudentGamesController } from './student-games.controller';

@Module({
  imports: [AuditModule],
  controllers: [
    PublicGamesController,
    MeGamesController,
    StudentGamesController,
    ClassGamesController,
    AdminGamesController,
  ],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
