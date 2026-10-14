import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { GamesAdminController } from '@/modules/games/controllers/games-admin.controller';
import { GamesClassController } from '@/modules/games/controllers/games-class.controller';
import { GamesMeController } from '@/modules/games/controllers/games-me.controller';
import { GamesPublicController } from '@/modules/games/controllers/games-public.controller';
import { GamesStudentController } from '@/modules/games/controllers/games-student.controller';
import { GameRepository } from '@/modules/games/repositories/game.repository';
import { GameCatalogService } from '@/modules/games/services/game-catalog.service';
import { GameUnlockService } from '@/modules/games/services/game-unlock.service';

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
