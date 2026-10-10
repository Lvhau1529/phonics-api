import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GamesAdminController } from './controllers/games-admin.controller';
import { GamesClassController } from './controllers/games-class.controller';
import { GamesMeController } from './controllers/games-me.controller';
import { GamesPublicController } from './controllers/games-public.controller';
import { GamesStudentController } from './controllers/games-student.controller';
import { GameRepository } from './repositories/game.repository';
import { GameCatalogService } from './services/game-catalog.service';
import { GameUnlockService } from './services/game-unlock.service';

/** Catalog game + mở khoá theo học sinh / lớp */
@Module({
  imports: [AuditModule],
  controllers: [
    GamesPublicController,
    GamesMeController,
    GamesStudentController,
    GamesClassController,
    GamesAdminController,
  ],
  providers: [GameRepository, GameCatalogService, GameUnlockService],
  exports: [GameUnlockService],
})
export class GamesModule {}
