import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GamesService } from './games.service';
import { AdminGamesController } from './v1/admin-games.controller';
import { ClassGamesController } from './v1/class-games.controller';
import { MeGamesController } from './v1/me-games.controller';
import { PublicGamesController } from './v1/public-games.controller';
import { StudentGamesController } from './v1/student-games.controller';

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
