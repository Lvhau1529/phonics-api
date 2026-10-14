import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermission, Roles } from '@/common/decorators/roles.decorator';
import { API_V1 } from '@/config/api-version';
import { type AuthUser } from '@/modules/auth/types/auth.types';
import { GameCatalogService } from '@/modules/games/services/game-catalog.service';
import { UpdateGameDto } from '@/modules/games/dto/requests/games.dto';

/** Quản trị catalog game */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller({ path: 'admin/games', version: API_V1 })
export class GamesAdminController {
  constructor(private readonly games: GameCatalogService) {}

  @Get()
  list() {
    return this.games.adminList();
  }

  @RequirePermission('games.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') gameId: string, @Body() body: UpdateGameDto) {
    return this.games.update(user, gameId, body);
  }
}
